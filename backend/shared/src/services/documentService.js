import crypto from 'node:crypto';
import path from 'node:path';
import { getDatabasePool } from '../db.js';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';
import { getStorageProvider } from '../storage/index.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { documentVersionRepository } from '../repositories/documentVersionRepository.js';
import { auditLogRepository } from '../repositories/auditLogRepository.js';
import { enqueueDocumentIngest } from '../queue/index.js';
import { cacheService } from '../cache/cacheService.js';
import {
  NotFoundError,
  ConflictError,
  InvalidFileError,
  ForbiddenError
} from '../errors.js';

export class DocumentService {
  constructor({
    docRepo = documentRepository,
    versionRepo = documentVersionRepository,
    auditRepo = auditLogRepository,
    storage = null,
    pool = null,
    config = null,
    cache = null
  } = {}) {
    this.docRepo = docRepo;
    this.versionRepo = versionRepo;
    this.auditRepo = auditRepo;
    this.storage = storage || getStorageProvider();
    this.pool = pool || getDatabasePool();
    this.config = config || getConfig();
    this.cache = cache || cacheService;
  }

  _sanitizeFilename(filename) {
    if (!filename) return 'document.pdf';
    const parsed = path.parse(filename);
    const safeBase = parsed.name
      .replace(/[^a-zA-Z0-9_\-\. ]/g, '')
      .trim()
      .slice(0, 100);
    return `${safeBase || 'document'}.pdf`;
  }

  _validatePdfUpload(fileBuffer, originalFilename, mimeType) {
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      throw new InvalidFileError('File buffer is required');
    }

    const maxBytes = this.config.MAX_UPLOAD_MB * 1024 * 1024;
    if (fileBuffer.length > maxBytes) {
      throw new InvalidFileError(
        `File size (${(fileBuffer.length / (1024 * 1024)).toFixed(1)}MB) exceeds limit of ${this.config.MAX_UPLOAD_MB}MB`
      );
    }

    // Check extension
    if (originalFilename && !originalFilename.toLowerCase().endsWith('.pdf')) {
      throw new InvalidFileError('File extension must be .pdf');
    }

    // Check MIME type
    if (mimeType && mimeType.toLowerCase() !== 'application/pdf') {
      throw new InvalidFileError('MIME type must be application/pdf');
    }

    // Check magic bytes (%PDF-)
    if (fileBuffer.length < 5 || fileBuffer.toString('utf8', 0, 5) !== '%PDF-') {
      throw new InvalidFileError('Invalid PDF file signature');
    }
  }

  /**
   * Uploads a new knowledge document.
   */
  async uploadDocument({ organizationId, userId, title, fileBuffer, originalFilename, mimeType }) {
    if (!title || !title.trim() || title.trim().length > 200) {
      throw new InvalidFileError('Document title must be between 1 and 200 characters');
    }

    this._validatePdfUpload(fileBuffer, originalFilename, mimeType);

    const cleanTitle = title.trim();
    const sanitizedFilename = this._sanitizeFilename(originalFilename);
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Duplicate SHA-256 detection within organization
    const existingDuplicate = await this.docRepo.findDuplicateSha256(organizationId, sha256);
    if (existingDuplicate) {
      throw new ConflictError(
        `An identical document with SHA-256 hash already exists ("${existingDuplicate.title}")`,
        'DUPLICATE_DOCUMENT'
      );
    }

    const storageKey = `org_${organizationId}/docs/${crypto.randomUUID()}.pdf`;

    // 1. Save to private storage first
    await this.storage.put(storageKey, fileBuffer, 'application/pdf');

    // 2. Insert DB records in a single transaction
    const client = await this.pool.connect();
    let doc;
    let version;

    try {
      await client.query('BEGIN');

      doc = await this.docRepo.create(
        {
          organizationId,
          createdBy: userId,
          title: cleanTitle
        },
        client
      );

      version = await this.versionRepo.create(
        {
          documentId: doc.id,
          organizationId,
          versionNumber: 1,
          origin: 'upload',
          uploadedBy: userId,
          originalFilename: sanitizedFilename,
          mimeType: 'application/pdf',
          sizeBytes: fileBuffer.length,
          sha256,
          storageProvider: this.config.STORAGE_PROVIDER,
          storageKey,
          status: 'uploaded'
        },
        client
      );

      await this.auditRepo.create(
        {
          organizationId,
          actorId: userId,
          action: 'document.create',
          entityType: 'document',
          entityId: doc.id,
          metadata: {
            title: cleanTitle,
            versionId: version.id,
            originalFilename: sanitizedFilename,
            sha256,
            sizeBytes: fileBuffer.length
          }
        },
        client
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      // Attempt cleanup of stored asset on failure
      try {
        await this.storage.delete(storageKey);
      } catch (cleanupErr) {
        logger.warn({ err: cleanupErr.message, storageKey }, 'Failed to clean up stored file after rollback');
      }
      throw err;
    } finally {
      client.release();
    }

    // 3. Enqueue ingestion job
    try {
      await enqueueDocumentIngest({ versionId: version.id, organizationId });
    } catch (queueErr) {
      logger.warn(
        { err: queueErr.message, versionId: version.id },
        'Initial job enqueue failed; will be recovered by reconciler'
      );
    }

    await this.cache.invalidateDocuments(organizationId);

    return {
      documentId: doc.id,
      versionId: version.id,
      status: 'uploaded'
    };
  }

  /**
   * Replaces a document file (safe replacement invariant).
   * Creates a new version row; old active version remains active until swap.
   */
  async replaceDocumentFile({ documentId, organizationId, userId, fileBuffer, originalFilename, mimeType }) {
    this._validatePdfUpload(fileBuffer, originalFilename, mimeType);

    const doc = await this.docRepo.findById(documentId, organizationId);
    if (!doc) {
      throw new NotFoundError('Document not found');
    }

    const sanitizedFilename = this._sanitizeFilename(originalFilename);
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Duplicate check
    const existingDuplicate = await this.docRepo.findDuplicateSha256(organizationId, sha256);
    if (existingDuplicate && existingDuplicate.document_id !== documentId) {
      throw new ConflictError(
        `An identical document with SHA-256 hash already exists ("${existingDuplicate.title}")`,
        'DUPLICATE_DOCUMENT'
      );
    }

    const storageKey = `org_${organizationId}/docs/${crypto.randomUUID()}.pdf`;

    // 1. Save to private storage
    await this.storage.put(storageKey, fileBuffer, 'application/pdf');

    // 2. DB transaction to register new version
    const client = await this.pool.connect();
    let version;

    try {
      await client.query('BEGIN');

      const nextVersionNum = await this.versionRepo.getNextVersionNumber(documentId, client);

      version = await this.versionRepo.create(
        {
          documentId,
          organizationId,
          versionNumber: nextVersionNum,
          origin: 'replace',
          uploadedBy: userId,
          originalFilename: sanitizedFilename,
          mimeType: 'application/pdf',
          sizeBytes: fileBuffer.length,
          sha256,
          storageProvider: this.config.STORAGE_PROVIDER,
          storageKey,
          status: 'uploaded'
        },
        client
      );

      await this.auditRepo.create(
        {
          organizationId,
          actorId: userId,
          action: 'document.replace',
          entityType: 'document',
          entityId: documentId,
          metadata: {
            versionId: version.id,
            versionNumber: nextVersionNum,
            originalFilename: sanitizedFilename,
            sha256
          }
        },
        client
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      try {
        await this.storage.delete(storageKey);
      } catch (cleanupErr) {
        logger.warn({ err: cleanupErr.message, storageKey }, 'Failed to clean up stored file after rollback');
      }
      throw err;
    } finally {
      client.release();
    }

    // 3. Enqueue ingestion
    try {
      await enqueueDocumentIngest({ versionId: version.id, organizationId });
    } catch (queueErr) {
      logger.warn(
        { err: queueErr.message, versionId: version.id },
        'Initial job enqueue failed; will be recovered by reconciler'
      );
    }

    await this.cache.invalidateDocuments(organizationId);

    return {
      documentId,
      versionId: version.id,
      status: 'uploaded'
    };
  }

  /**
   * Re-indexes a document using its existing stored file asset.
   */
  async reindexDocument({ documentId, organizationId, userId }) {
    const doc = await this.docRepo.findById(documentId, organizationId);
    if (!doc) {
      throw new NotFoundError('Document not found');
    }

    // Base asset from active or latest version
    const sourceVersion = doc.activeVersion || doc.latestVersion;
    if (!sourceVersion || !sourceVersion.storageKey) {
      throw new NotFoundError('No valid stored file found to re-index');
    }

    const client = await this.pool.connect();
    let version;

    try {
      await client.query('BEGIN');

      const nextVersionNum = await this.versionRepo.getNextVersionNumber(documentId, client);

      version = await this.versionRepo.create(
        {
          documentId,
          organizationId,
          versionNumber: nextVersionNum,
          origin: 'reindex',
          uploadedBy: userId,
          originalFilename: sourceVersion.originalFilename,
          mimeType: 'application/pdf',
          sizeBytes: sourceVersion.sizeBytes,
          sha256: sourceVersion.sha256,
          storageProvider: sourceVersion.storageProvider,
          storageKey: sourceVersion.storageKey,
          status: 'uploaded'
        },
        client
      );

      await this.auditRepo.create(
        {
          organizationId,
          actorId: userId,
          action: 'document.reindex',
          entityType: 'document',
          entityId: documentId,
          metadata: {
            versionId: version.id,
            versionNumber: nextVersionNum,
            reusedStorageKey: sourceVersion.storageKey
          }
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

    try {
      await enqueueDocumentIngest({ versionId: version.id, organizationId });
    } catch (queueErr) {
      logger.warn(
        { err: queueErr.message, versionId: version.id },
        'Re-index enqueue failed; will be recovered by reconciler'
      );
    }

    await this.cache.invalidateDocuments(organizationId);

    return {
      documentId,
      versionId: version.id,
      status: 'uploaded'
    };
  }

  /**
   * Retrieves single document by ID.
   */
  async getDocument(documentId, organizationId) {
    const doc = await this.docRepo.findById(documentId, organizationId);
    if (!doc) {
      throw new NotFoundError('Document not found');
    }
    return doc;
  }

  /**
   * Lists documents in organization with 60s TTL caching.
   */
  async listDocuments(organizationId, queryParams) {
    const cached = await this.cache.getDocumentList(organizationId, queryParams);
    if (cached) return cached;

    const result = await this.docRepo.list(organizationId, queryParams);
    await this.cache.setDocumentList(organizationId, queryParams, result, 60);
    return result;
  }

  /**
   * Lists versions for a document.
   */
  async listVersions(documentId, organizationId) {
    const doc = await this.docRepo.findById(documentId, organizationId);
    if (!doc) {
      throw new NotFoundError('Document not found');
    }
    return this.versionRepo.listVersionsByDocumentId(documentId, organizationId);
  }

  /**
   * Soft-deletes a document. Retrieval stops immediately.
   */
  async deleteDocument(documentId, organizationId, userId) {
    const deleted = await this.docRepo.softDelete(documentId, organizationId);
    if (!deleted) {
      throw new NotFoundError('Document not found');
    }

    await this.auditRepo.create({
      organizationId,
      actorId: userId,
      action: 'document.delete',
      entityType: 'document',
      entityId: documentId,
      metadata: { title: deleted.title }
    });

    await this.cache.invalidateDocuments(organizationId);

    return { deleted: true };
  }

  /**
   * Generates a signed, short-lived download URL.
   */
  async createDownloadUrl({ documentId, versionParam, organizationId, userId }) {
    const doc = await this.docRepo.findById(documentId, organizationId);
    if (!doc) {
      throw new NotFoundError('Document not found');
    }

    let targetVersionId;
    if (!versionParam || versionParam === 'active') {
      if (!doc.activeVersionId) {
        throw new NotFoundError('No active indexed version available for download');
      }
      targetVersionId = doc.activeVersionId;
    } else {
      // Specific version UUID
      const version = await this.versionRepo.findById(versionParam, organizationId);
      if (!version || version.document_id !== documentId) {
        throw new NotFoundError('Requested document version not found');
      }
      targetVersionId = version.id;
    }

    const { url, expiresAt } = await this.storage.createSignedDownloadUrl(
      documentId,
      targetVersionId,
      this.config.SIGNED_URL_TTL_SECONDS
    );

    await this.auditRepo.create({
      organizationId,
      actorId: userId,
      action: 'document.download_url',
      entityType: 'document',
      entityId: documentId,
      metadata: { targetVersionId, expiresAt }
    });

    return { url, expiresAt };
  }

  /**
   * Streams/reads file content after HMAC token validation.
   */
  async getFileBySignedToken({ documentId, versionId, token, exp }) {
    const isValid = this.storage.verifyToken(versionId, token, exp);
    if (!isValid) {
      throw new ForbiddenError('Download link is invalid or has expired', 'INVALID_DOWNLOAD_TOKEN');
    }

    const version = await this.versionRepo.findById(versionId);
    if (!version || version.document_id !== documentId) {
      throw new NotFoundError('Document version not found');
    }

    if (version.document_deleted_at) {
      throw new NotFoundError('Document has been deleted');
    }

    const fileBuffer = await this.storage.get(version.storage_key);
    return {
      buffer: fileBuffer,
      filename: version.original_filename,
      mimeType: version.mime_type || 'application/pdf',
      sizeBytes: version.size_bytes
    };
  }
}

export const documentService = new DocumentService();
