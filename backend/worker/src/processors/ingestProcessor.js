import {
  logger,
  getConfig,
  getDatabasePool,
  getStorageProvider,
  extractPdfText,
  chunkPages,
  getEmbeddingProvider,
  indexingConfigRepository,
  documentVersionRepository,
  documentChunkRepository,
  cacheService,
  PdfExtractionError,
  EmbeddingDimensionMismatchError
} from '@supportflow/shared';

export async function processIngestJob(job) {
  const { versionId, organizationId } = job.data;
  const config = getConfig();
  const pool = getDatabasePool();
  const storage = getStorageProvider();

  logger.info(
    { jobId: job.id, versionId, organizationId, attempt: job.attemptsMade },
    'Starting document ingestion job'
  );

  // 1. Claim version for processing
  const claimed = await documentVersionRepository.claimForProcessing(versionId);
  if (!claimed) {
    // If not claimable (already indexed or does not exist), no-op for idempotency
    const current = await documentVersionRepository.findById(versionId);
    if (current?.status === 'indexed') {
      logger.info({ jobId: job.id, versionId }, 'Version is already indexed. Skipping job idempotently.');
      return { status: 'already_indexed' };
    }
    logger.warn({ jobId: job.id, versionId }, 'Version could not be claimed for processing.');
    return { status: 'claim_failed' };
  }

  const version = claimed;

  try {
    // 2. Fetch file from storage
    logger.debug({ versionId, storageKey: version.storage_key }, 'Fetching PDF from storage');
    const pdfBuffer = await storage.get(version.storage_key);

    // 3. Extract text page by page
    logger.debug({ versionId }, 'Extracting PDF text');
    let extracted;
    try {
      extracted = await extractPdfText(pdfBuffer, { maxPages: config.MAX_PDF_PAGES });
    } catch (err) {
      if (err instanceof PdfExtractionError) {
        // Non-retryable PDF error: mark failed immediately and do not retry in BullMQ
        logger.warn(
          { versionId, code: err.code, message: err.message },
          'Non-retryable PDF extraction failure; marking version as failed'
        );
        await documentVersionRepository.updateProcessingFailure(versionId, {
          errorCode: err.code,
          errorMessage: err.message
        });
        await cacheService.invalidateDocuments(organizationId);
        return { status: 'failed', errorCode: err.code, nonRetryable: true };
      }
      throw err;
    }

    // 4. Chunk text per page
    const activeConfig = await indexingConfigRepository.getActiveConfig();
    if (!activeConfig) {
      throw new Error('No active indexing configuration found');
    }

    const chunkSize = activeConfig.chunk_size_chars || 800;
    const chunkOverlap = activeConfig.chunk_overlap_chars || 120;
    const rawChunks = chunkPages(extracted.pages, {
      chunkSizeChars: chunkSize,
      chunkOverlapChars: chunkOverlap
    });

    if (rawChunks.length === 0) {
      logger.warn({ versionId }, 'No text chunks generated; marking version failed');
      await documentVersionRepository.updateProcessingFailure(versionId, {
        errorCode: 'PDF_NO_TEXT',
        errorMessage: 'Document produced 0 text chunks'
      });
      return { status: 'failed', errorCode: 'PDF_NO_TEXT', nonRetryable: true };
    }

    // 5. Generate embeddings
    logger.debug({ versionId, chunkCount: rawChunks.length }, 'Generating embeddings');
    const embeddingProvider = getEmbeddingProvider();

    if (embeddingProvider.dimensions !== activeConfig.dimensions) {
      const err = new EmbeddingDimensionMismatchError(
        `Provider dimensions (${embeddingProvider.dimensions}) do not match active config dimensions (${activeConfig.dimensions})`
      );
      await documentVersionRepository.updateProcessingFailure(versionId, {
        errorCode: err.code,
        errorMessage: err.message
      });
      return { status: 'failed', errorCode: err.code, nonRetryable: true };
    }

    const textsToEmbed = rawChunks.map((c) => c.content);
    const vectors = await embeddingProvider.embedDocuments(textsToEmbed);

    const readyChunks = rawChunks.map((c, i) => ({
      organizationId,
      documentId: version.document_id,
      documentVersionId: versionId,
      indexingConfigId: activeConfig.id,
      embeddingDimensions: activeConfig.dimensions,
      chunkIndex: c.chunkIndex,
      pageNumber: c.pageNumber,
      content: c.content,
      contentSha256: c.contentSha256,
      charCount: c.charCount,
      embedding: vectors[i]
    }));

    // 6. DB write: insert chunks + atomic swap in one transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Scoped delete-then-insert for idempotency
      await documentChunkRepository.deleteChunksForVersionAndConfig(
        versionId,
        activeConfig.id,
        client
      );

      await documentChunkRepository.insertChunks(readyChunks, client);

      await documentVersionRepository.atomicSwapVersion(
        {
          documentId: version.document_id,
          versionId,
          pageCount: extracted.pageCount
        },
        client
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await cacheService.invalidateDocuments(organizationId);

    logger.info(
      {
        jobId: job.id,
        versionId,
        documentId: version.document_id,
        pageCount: extracted.pageCount,
        chunkCount: readyChunks.length
      },
      'Document successfully indexed and version activated'
    );

    return {
      status: 'indexed',
      pageCount: extracted.pageCount,
      chunkCount: readyChunks.length
    };
  } catch (err) {
    logger.error(
      { jobId: job.id, versionId, err: err.message, stack: err.stack },
      'Ingestion job encountered an error'
    );

    // If final attempt or non-retryable
    const maxAttempts = config.INGEST_JOB_ATTEMPTS;
    if (job.attemptsMade + 1 >= maxAttempts) {
      await documentVersionRepository.updateProcessingFailure(versionId, {
        errorCode: 'PROCESSING_FAILED',
        errorMessage: err.message || 'Ingestion job exhausted retry attempts'
      });
      await cacheService.invalidateDocuments(organizationId);
    }

    throw err; // Re-throw to allow BullMQ retry if attempts remain
  }
}
