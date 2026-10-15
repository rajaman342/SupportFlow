import { getDatabasePool } from '../db.js';

export class DocumentChunkRepository {
  constructor(pool = null) {
    this.pool = pool || getDatabasePool();
  }

  /**
   * Deletes all chunks belonging to a specific version and indexing configuration.
   */
  async deleteChunksForVersionAndConfig(versionId, indexingConfigId, client = null) {
    const db = client || this.pool;
    const sql = `
      DELETE FROM document_chunks
      WHERE document_version_id = $1
        AND indexing_config_id = $2;
    `;
    const res = await db.query(sql, [versionId, indexingConfigId]);
    return res.rowCount;
  }

  /**
   * Deletes all chunks belonging to a specific version.
   */
  async deleteChunksForVersion(versionId, client = null) {
    const db = client || this.pool;
    const sql = `
      DELETE FROM document_chunks
      WHERE document_version_id = $1;
    `;
    const res = await db.query(sql, [versionId]);
    return res.rowCount;
  }

  /**
   * Inserts batches of document chunks with vector embeddings.
   * Scoped delete-then-insert makes this strictly idempotent.
   *
   * @param {Array<object>} chunks
   * @param {object|null} client
   */
  async insertChunks(chunks, client = null) {
    if (!chunks || chunks.length === 0) {
      return [];
    }

    const db = client || this.pool;
    const batchSize = 100;
    const insertedRows = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const values = [];
      const rowPlaceholders = [];

      batch.forEach((chunk, idx) => {
        const offset = idx * 11;
        const vectorStr = `[${chunk.embedding.join(',')}]`;

        values.push(
          chunk.organizationId,
          chunk.documentId,
          chunk.documentVersionId,
          chunk.indexingConfigId,
          chunk.embeddingDimensions,
          chunk.chunkIndex,
          chunk.pageNumber,
          chunk.content,
          chunk.contentSha256,
          chunk.charCount,
          vectorStr
        );

        rowPlaceholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}::vector)`
        );
      });

      const sql = `
        INSERT INTO document_chunks (
          organization_id,
          document_id,
          document_version_id,
          indexing_config_id,
          embedding_dimensions,
          chunk_index,
          page_number,
          content,
          content_sha256,
          char_count,
          embedding
        ) VALUES ${rowPlaceholders.join(', ')}
        ON CONFLICT (document_version_id, indexing_config_id, chunk_index)
        DO UPDATE SET
          content = EXCLUDED.content,
          content_sha256 = EXCLUDED.content_sha256,
          char_count = EXCLUDED.char_count,
          embedding = EXCLUDED.embedding
        RETURNING id, chunk_index, page_number;
      `;

      const res = await db.query(sql, values);
      insertedRows.push(...res.rows);
    }

    return insertedRows;
  }

  /**
   * Counts total chunks for a version.
   */
  async countChunksForVersion(versionId, client = null) {
    const db = client || this.pool;
    const sql = `
      SELECT COUNT(*)::int AS count
      FROM document_chunks
      WHERE document_version_id = $1;
    `;
    const res = await db.query(sql, [versionId]);
    return res.rows[0]?.count || 0;
  }

  /**
   * Counts total chunks for a document.
   */
  async countChunksForDocument(documentId, client = null) {
    const db = client || this.pool;
    const sql = `
      SELECT COUNT(*)::int AS count
      FROM document_chunks
      WHERE document_id = $1;
    `;
    const res = await db.query(sql, [documentId]);
    return res.rows[0]?.count || 0;
  }
}

export const documentChunkRepository = new DocumentChunkRepository();
