import { getDatabasePool } from '../db.js';

export class DocumentVersionRepository {
  constructor(pool = null) {
    this.pool = pool || getDatabasePool();
  }

  /**
   * Creates a new document version row.
   */
  async create({
    documentId,
    organizationId,
    versionNumber,
    origin,
    uploadedBy,
    originalFilename,
    mimeType = 'application/pdf',
    sizeBytes,
    sha256,
    storageProvider,
    storageKey,
    status = 'uploaded'
  }, client = null) {
    const db = client || this.pool;
    const sql = `
      INSERT INTO knowledge_document_versions (
        document_id,
        organization_id,
        version_number,
        origin,
        uploaded_by,
        original_filename,
        mime_type,
        size_bytes,
        sha256,
        storage_provider,
        storage_key,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `;
    const res = await db.query(
      sql,
      [
        documentId,
        organizationId,
        versionNumber,
        origin,
        uploadedBy,
        originalFilename,
        mimeType,
        sizeBytes,
        sha256,
        storageProvider,
        storageKey,
        status
      ]
    );
    return res.rows[0];
  }

  /**
   * Computes the next version number for a document.
   */
  async getNextVersionNumber(documentId, client = null) {
    const db = client || this.pool;
    const sql = `
      SELECT COALESCE(MAX(version_number), 0) + 1 AS next_num
      FROM knowledge_document_versions
      WHERE document_id = $1;
    `;
    const res = await db.query(sql, [documentId]);
    return Number(res.rows[0]?.next_num || 1);
  }

  /**
   * Finds a document version by its ID.
   */
  async findById(id, organizationId = null, client = null) {
    const db = client || this.pool;
    const params = [id];
    let sql = `
      SELECT v.*, d.title AS document_title, d.deleted_at AS document_deleted_at
      FROM knowledge_document_versions v
      JOIN knowledge_documents d ON v.document_id = d.id
      WHERE v.id = $1
    `;
    if (organizationId) {
      params.push(organizationId);
      sql += ` AND v.organization_id = $2`;
    }
    const res = await db.query(sql, params);
    return res.rows[0] || null;
  }

  /**
   * Lists all versions of a document.
   */
  async listVersionsByDocumentId(documentId, organizationId, client = null) {
    const db = client || this.pool;
    const sql = `
      SELECT
        v.id,
        v.document_id,
        v.organization_id,
        v.version_number,
        v.origin,
        v.uploaded_by,
        u.full_name AS uploaded_by_name,
        v.original_filename,
        v.mime_type,
        v.size_bytes,
        v.sha256,
        v.storage_provider,
        v.status,
        v.page_count,
        v.attempt_count,
        v.error_code,
        v.error_message,
        v.processing_started_at,
        v.indexed_at,
        v.created_at,
        v.updated_at
      FROM knowledge_document_versions v
      LEFT JOIN users u ON v.uploaded_by = u.id
      WHERE v.document_id = $1
        AND v.organization_id = $2
      ORDER BY v.version_number DESC;
    `;
    const res = await db.query(sql, [documentId, organizationId]);
    return res.rows;
  }

  /**
   * Claims a version for processing in a safe, conditional UPDATE.
   * If already indexed, returns null.
   */
  async claimForProcessing(versionId, client = null) {
    const db = client || this.pool;
    const sql = `
      UPDATE knowledge_document_versions
      SET status = 'processing',
          processing_started_at = NOW(),
          attempt_count = attempt_count + 1,
          updated_at = NOW()
      WHERE id = $1
        AND status IN ('uploaded', 'processing', 'failed')
      RETURNING *;
    `;
    const res = await db.query(sql, [versionId]);
    return res.rows[0] || null;
  }

  /**
   * Marks a version as failed with safe error details.
   */
  async updateProcessingFailure(versionId, { errorCode, errorMessage }, client = null) {
    const db = client || this.pool;
    const sql = `
      UPDATE knowledge_document_versions
      SET status = 'failed',
          error_code = $2,
          error_message = $3,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const res = await db.query(sql, [versionId, errorCode, errorMessage]);
    return res.rows[0] || null;
  }

  /**
   * Atomically activates a newly indexed version:
   * 1. Marks this version as 'indexed' and sets page_count / indexed_at.
   * 2. Sets knowledge_documents.active_version_id to this version.
   * 3. Sets any previous 'indexed' versions for this document to 'superseded'.
   */
  async atomicSwapVersion({ documentId, versionId, pageCount }, client = null) {
    const shouldManageTx = !client;
    const tx = client || (await this.pool.connect());

    try {
      if (shouldManageTx) await tx.query('BEGIN');

      // 1. Mark new version as indexed
      const markSql = `
        UPDATE knowledge_document_versions
        SET status = 'indexed',
            page_count = $2,
            indexed_at = NOW(),
            error_code = NULL,
            error_message = NULL,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *;
      `;
      const markRes = await tx.query(markSql, [versionId, pageCount]);
      const updatedVersion = markRes.rows[0];

      // 2. Mark previous active/indexed versions as superseded
      const supersedeSql = `
        UPDATE knowledge_document_versions
        SET status = 'superseded',
            updated_at = NOW()
        WHERE document_id = $1
          AND id != $2
          AND status = 'indexed';
      `;
      await tx.query(supersedeSql, [documentId, versionId]);

      // 3. Update document active_version_id
      const docSql = `
        UPDATE knowledge_documents
        SET active_version_id = $2,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *;
      `;
      await tx.query(docSql, [documentId, versionId]);

      if (shouldManageTx) await tx.query('COMMIT');
      return updatedVersion;
    } catch (err) {
      if (shouldManageTx) await tx.query('ROLLBACK');
      throw err;
    } finally {
      if (shouldManageTx) tx.release();
    }
  }

  /**
   * Checks if any other document version references the given storage key.
   */
  async isStorageKeyReferencedByOtherVersions(storageKey, excludingVersionId = null, client = null) {
    const db = client || this.pool;
    const params = [storageKey];
    let sql = `
      SELECT id
      FROM knowledge_document_versions
      WHERE storage_key = $1
    `;
    if (excludingVersionId) {
      params.push(excludingVersionId);
      sql += ` AND id != $2`;
    }
    sql += ` LIMIT 1;`;
    const res = await db.query(sql, params);
    return res.rows.length > 0;
  }

  /**
   * Retrieves versions that appear stuck for the reconciler.
   */
  async getStuckVersions(thresholdMinutes = 15, client = null) {
    const db = client || this.pool;
    const sql = `
      SELECT v.*
      FROM knowledge_document_versions v
      JOIN knowledge_documents d ON v.document_id = d.id
      WHERE d.deleted_at IS NULL
        AND (
          (v.status = 'uploaded' AND v.created_at < NOW() - ($1 || ' minutes')::interval)
          OR
          (v.status = 'processing' AND v.processing_started_at < NOW() - ($1 || ' minutes')::interval)
        )
      ORDER BY v.created_at ASC
      LIMIT 50;
    `;
    const res = await db.query(sql, [thresholdMinutes]);
    return res.rows;
  }
}

export const documentVersionRepository = new DocumentVersionRepository();
