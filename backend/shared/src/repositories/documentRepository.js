import { getDatabasePool } from '../db.js';

export class DocumentRepository {
  constructor(pool = null) {
    this.pool = pool || getDatabasePool();
  }

  /**
   * Creates a logical knowledge document record.
   */
  async create({ organizationId, createdBy, title }, client = null) {
    const db = client || this.pool;
    const sql = `
      INSERT INTO knowledge_documents (
        organization_id,
        created_by,
        title
      ) VALUES ($1, $2, $3)
      RETURNING id, organization_id, created_by, title, active_version_id, deleted_at, created_at, updated_at;
    `;
    const res = await db.query(sql, [organizationId, createdBy, title]);
    return res.rows[0];
  }

  /**
   * Retrieves document with latest version, active version, and chunk/page counts.
   */
  async findById(id, organizationId, client = null) {
    const db = client || this.pool;
    const sql = `
      SELECT
        d.id,
        d.organization_id,
        d.created_by,
        d.title,
        d.active_version_id,
        d.deleted_at,
        d.created_at,
        d.updated_at,
        -- Active version JSON
        CASE WHEN av.id IS NOT NULL THEN json_build_object(
          'id', av.id,
          'versionNumber', av.version_number,
          'origin', av.origin,
          'status', av.status,
          'pageCount', av.page_count,
          'originalFilename', av.original_filename,
          'sizeBytes', av.size_bytes,
          'sha256', av.sha256,
          'storageProvider', av.storage_provider,
          'storageKey', av.storage_key,
          'indexedAt', av.indexed_at,
          'createdAt', av.created_at
        ) ELSE NULL END AS active_version,
        -- Latest version JSON
        CASE WHEN lv.id IS NOT NULL THEN json_build_object(
          'id', lv.id,
          'versionNumber', lv.version_number,
          'origin', lv.origin,
          'status', lv.status,
          'pageCount', lv.page_count,
          'originalFilename', lv.original_filename,
          'sizeBytes', lv.size_bytes,
          'sha256', lv.sha256,
          'storageProvider', lv.storage_provider,
          'storageKey', lv.storage_key,
          'errorCode', lv.error_code,
          'errorMessage', lv.error_message,
          'attemptCount', lv.attempt_count,
          'indexedAt', lv.indexed_at,
          'createdAt', lv.created_at
        ) ELSE NULL END AS latest_version,
        -- Total chunk count across active version
        COALESCE((
          SELECT COUNT(*)::int
          FROM document_chunks dc
          WHERE dc.document_version_id = d.active_version_id
        ), 0) AS chunk_count
      FROM knowledge_documents d
      LEFT JOIN knowledge_document_versions av ON d.active_version_id = av.id
      LEFT JOIN LATERAL (
        SELECT *
        FROM knowledge_document_versions v
        WHERE v.document_id = d.id
        ORDER BY v.version_number DESC
        LIMIT 1
      ) lv ON true
      WHERE d.id = $1
        AND d.organization_id = $2
        AND d.deleted_at IS NULL;
    `;
    const res = await db.query(sql, [id, organizationId]);
    if (!res.rows[0]) return null;

    const row = res.rows[0];
    const latestVersion = row.latest_version;
    const activeVersion = row.active_version;

    // servingPreviousVersion is true when there is an active version, but the latest version
    // is in a non-indexed state (uploaded, processing, failed) or is different from active.
    const servingPreviousVersion = Boolean(
      activeVersion &&
      latestVersion &&
      activeVersion.id !== latestVersion.id &&
      latestVersion.status !== 'indexed'
    );

    return {
      id: row.id,
      organizationId: row.organization_id,
      createdBy: row.created_by,
      title: row.title,
      activeVersionId: row.active_version_id,
      activeVersion,
      latestVersion,
      servingPreviousVersion,
      pageCount: activeVersion ? activeVersion.pageCount : (latestVersion ? latestVersion.pageCount : null),
      chunkCount: row.chunk_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Lists documents in an organization with search and filter.
   */
  async list(organizationId, { q = '', status = '', page = 1, limit = 20 } = {}, client = null) {
    const db = client || this.pool;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const params = [organizationId];
    const whereClauses = ['d.organization_id = $1', 'd.deleted_at IS NULL'];

    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      whereClauses.push(`d.title ILIKE $${params.length}`);
    }

    if (status && status.trim()) {
      params.push(status.trim());
      whereClauses.push(`lv.status = $${params.length}`);
    }

    const whereSql = whereClauses.join(' AND ');

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM knowledge_documents d
      LEFT JOIN LATERAL (
        SELECT status
        FROM knowledge_document_versions v
        WHERE v.document_id = d.id
        ORDER BY v.version_number DESC
        LIMIT 1
      ) lv ON true
      WHERE ${whereSql};
    `;
    const countRes = await db.query(countSql, params);
    const total = countRes.rows[0]?.total || 0;

    const listParams = [...params, limitNum, offset];
    const dataSql = `
      SELECT
        d.id,
        d.organization_id,
        d.created_by,
        d.title,
        d.active_version_id,
        d.created_at,
        d.updated_at,
        CASE WHEN lv.id IS NOT NULL THEN json_build_object(
          'id', lv.id,
          'versionNumber', lv.version_number,
          'origin', lv.origin,
          'status', lv.status,
          'pageCount', lv.page_count,
          'originalFilename', lv.original_filename,
          'sizeBytes', lv.size_bytes,
          'sha256', lv.sha256,
          'errorCode', lv.error_code,
          'errorMessage', lv.error_message,
          'indexedAt', lv.indexed_at,
          'createdAt', lv.created_at
        ) ELSE NULL END AS latest_version,
        CASE WHEN av.id IS NOT NULL THEN json_build_object(
          'id', av.id,
          'versionNumber', av.version_number,
          'status', av.status,
          'pageCount', av.page_count
        ) ELSE NULL END AS active_version
      FROM knowledge_documents d
      LEFT JOIN knowledge_document_versions av ON d.active_version_id = av.id
      LEFT JOIN LATERAL (
        SELECT *
        FROM knowledge_document_versions v
        WHERE v.document_id = d.id
        ORDER BY v.version_number DESC
        LIMIT 1
      ) lv ON true
      WHERE ${whereSql}
      ORDER BY d.updated_at DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length};
    `;

    const dataRes = await db.query(dataSql, listParams);

    const items = dataRes.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      createdBy: row.created_by,
      title: row.title,
      activeVersionId: row.active_version_id,
      latestVersion: row.latest_version,
      activeVersion: row.active_version,
      status: row.latest_version ? row.latest_version.status : 'uploaded',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    return {
      items,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum)
    };
  }

  /**
   * Soft deletes a document.
   */
  async softDelete(id, organizationId, client = null) {
    const db = client || this.pool;
    const sql = `
      UPDATE knowledge_documents
      SET deleted_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
        AND organization_id = $2
        AND deleted_at IS NULL
      RETURNING id, organization_id, title, deleted_at;
    `;
    const res = await db.query(sql, [id, organizationId]);
    return res.rows[0] || null;
  }

  /**
   * Checks for duplicate SHA-256 within the same organization among non-deleted documents.
   */
  async findDuplicateSha256(organizationId, sha256, client = null) {
    const db = client || this.pool;
    const sql = `
      SELECT v.document_id, v.id AS version_id, d.title
      FROM knowledge_document_versions v
      JOIN knowledge_documents d ON v.document_id = d.id
      WHERE v.organization_id = $1
        AND v.sha256 = $2
        AND d.deleted_at IS NULL
        AND v.status IN ('uploaded', 'processing', 'indexed')
      LIMIT 1;
    `;
    const res = await db.query(sql, [organizationId, sha256]);
    return res.rows[0] || null;
  }
}

export const documentRepository = new DocumentRepository();
