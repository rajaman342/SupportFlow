import { getDatabasePool } from '../db.js';

export class AiResponseRepository {
  constructor(pool = null) {
    this.pool = pool || getDatabasePool();
  }

  /**
   * Persists an AI suggestion and its retrieved source snapshots in a single transaction.
   *
   * @param {object} params
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<object>}
   */
  async createWithSources(
    {
      organizationId,
      ticketId,
      requestedBy,
      indexingConfigId,
      queryText,
      triggerMessageId = null,
      outcome,
      draftBody = null,
      suggestedCategory = null,
      suggestedPriority = null,
      provider,
      model,
      promptVersion,
      latencyMs = null,
      inputTokens = null,
      outputTokens = null,
      topSimilarity = null,
      errorCode = null,
      sources = []
    },
    client = null
  ) {
    const shouldManageTx = !client;
    const tx = client || (await this.pool.connect());

    try {
      if (shouldManageTx) await tx.query('BEGIN');

      const responseSql = `
        INSERT INTO ai_responses (
          organization_id, ticket_id, requested_by, indexing_config_id,
          query_text, trigger_message_id, outcome, draft_body,
          suggested_category, suggested_priority, provider, model,
          prompt_version, latency_ms, input_tokens, output_tokens,
          top_similarity, error_code
        )
        VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15, $16,
          $17, $18
        )
        RETURNING *;
      `;

      const resResult = await tx.query(responseSql, [
        organizationId,
        ticketId,
        requestedBy,
        indexingConfigId,
        queryText,
        triggerMessageId,
        outcome,
        draftBody,
        suggestedCategory,
        suggestedPriority,
        provider,
        model,
        promptVersion,
        latencyMs,
        inputTokens,
        outputTokens,
        topSimilarity,
        errorCode
      ]);
      const responseRow = resResult.rows[0];

      const insertedSources = [];
      if (sources && sources.length > 0) {
        for (const s of sources) {
          const sourceSql = `
            INSERT INTO ai_response_sources (
              ai_response_id, organization_id, chunk_id, document_id,
              document_version_id, document_title, page_number, similarity,
              rank, cited_in_answer, snippet
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *;
          `;
          const sRes = await tx.query(sourceSql, [
            responseRow.id,
            organizationId,
            s.chunkId || null,
            s.documentId,
            s.documentVersionId,
            s.documentTitle,
            s.pageNumber,
            s.similarity,
            s.rank,
            Boolean(s.citedInAnswer),
            s.snippet
          ]);
          const row = sRes.rows[0];
          insertedSources.push({
            id: row.id,
            aiResponseId: row.ai_response_id,
            organizationId: row.organization_id,
            chunkId: row.chunk_id,
            documentId: row.document_id,
            documentVersionId: row.document_version_id,
            documentTitle: row.document_title,
            pageNumber: row.page_number,
            similarity: Number(row.similarity),
            rank: row.rank,
            citedInAnswer: Boolean(row.cited_in_answer),
            snippet: row.snippet,
            createdAt: row.created_at
          });
        }
      }

      if (shouldManageTx) await tx.query('COMMIT');

      return this._formatResponse(responseRow, insertedSources);
    } catch (err) {
      if (shouldManageTx) await tx.query('ROLLBACK');
      throw err;
    } finally {
      if (shouldManageTx) tx.release();
    }
  }

  /**
   * Fetches an AI suggestion by ID with tenant isolation and its sources snapshot.
   */
  async findById(id, organizationId, client = null) {
    const db = client || this.pool;
    const sql = `
      SELECT r.*
      FROM ai_responses r
      WHERE r.id = $1 AND r.organization_id = $2;
    `;
    const res = await db.query(sql, [id, organizationId]);
    if (!res.rows.length) return null;

    const sources = await this._loadSources(id, organizationId, db);
    return this._formatResponse(res.rows[0], sources);
  }

  /**
   * Finds latest pending_review suggestion for ticket matching message & config.
   */
  async findLatestPendingForTicket(
    ticketId,
    organizationId,
    { triggerMessageId = null, indexingConfigId = null } = {},
    client = null
  ) {
    const db = client || this.pool;
    const sql = `
      SELECT r.*
      FROM ai_responses r
      WHERE r.ticket_id = $1
        AND r.organization_id = $2
        AND r.review_status = 'pending_review'
        AND ($3::uuid IS NULL OR r.trigger_message_id = $3)
        AND ($4::uuid IS NULL OR r.indexing_config_id = $4)
      ORDER BY r.created_at DESC
      LIMIT 1;
    `;
    const res = await db.query(sql, [ticketId, organizationId, triggerMessageId, indexingConfigId]);
    if (!res.rows.length) return null;

    const sources = await this._loadSources(res.rows[0].id, organizationId, db);
    return this._formatResponse(res.rows[0], sources);
  }

  /**
   * Lists AI suggestions for a ticket, newest first.
   */
  async listByTicket(ticketId, organizationId, { page = 1, limit = 20 } = {}, client = null) {
    const db = client || this.pool;
    const offset = (page - 1) * limit;

    const countSql = `
      SELECT count(*)::int AS total
      FROM ai_responses
      WHERE ticket_id = $1 AND organization_id = $2;
    `;
    const countRes = await db.query(countSql, [ticketId, organizationId]);
    const total = countRes.rows[0]?.total || 0;

    const sql = `
      SELECT r.*
      FROM ai_responses r
      WHERE r.ticket_id = $1 AND r.organization_id = $2
      ORDER BY r.created_at DESC
      LIMIT $3 OFFSET $4;
    `;
    const res = await db.query(sql, [ticketId, organizationId, limit, offset]);

    const items = [];
    for (const row of res.rows) {
      const sources = await this._loadSources(row.id, organizationId, db);
      items.push(this._formatResponse(row, sources));
    }

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Updates review status of an AI suggestion.
   */
  async updateReview(
    id,
    organizationId,
    { reviewStatus, reviewedBy, reviewedAt, finalBody = null },
    client = null
  ) {
    const db = client || this.pool;
    const sql = `
      UPDATE ai_responses
      SET review_status = $1,
          reviewed_by = $2,
          reviewed_at = $3,
          final_body = $4,
          updated_at = now()
      WHERE id = $5 AND organization_id = $6
      RETURNING *;
    `;
    const res = await db.query(sql, [
      reviewStatus,
      reviewedBy,
      reviewedAt,
      finalBody,
      id,
      organizationId
    ]);
    if (!res.rows.length) return null;

    const sources = await this._loadSources(id, organizationId, db);
    return this._formatResponse(res.rows[0], sources);
  }

  /**
   * Fetches single source snapshot with dynamic sourceState: 'current' | 'superseded' | 'deleted'.
   */
  async getSourceById(sourceId, aiResponseId, organizationId, client = null) {
    const db = client || this.pool;
    const sql = `
      SELECT s.*,
             d.deleted_at IS NOT NULL AS is_deleted,
             d.active_version_id != s.document_version_id AS is_superseded,
             d.id IS NULL AS doc_missing
      FROM ai_response_sources s
      LEFT JOIN knowledge_documents d
        ON d.id = s.document_id AND d.organization_id = s.organization_id
      WHERE s.id = $1 AND s.ai_response_id = $2 AND s.organization_id = $3;
    `;
    const res = await db.query(sql, [sourceId, aiResponseId, organizationId]);
    if (!res.rows.length) return null;

    const row = res.rows[0];
    let sourceState = 'current';
    if (row.doc_missing || row.is_deleted) {
      sourceState = 'deleted';
    } else if (row.is_superseded) {
      sourceState = 'superseded';
    }

    return {
      id: row.id,
      aiResponseId: row.ai_response_id,
      organizationId: row.organization_id,
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentVersionId: row.document_version_id,
      documentTitle: row.document_title,
      pageNumber: row.page_number,
      similarity: Number(row.similarity),
      rank: row.rank,
      citedInAnswer: Boolean(row.cited_in_answer),
      snippet: row.snippet,
      sourceState,
      createdAt: row.created_at
    };
  }

  async _loadSources(aiResponseId, organizationId, db) {
    const sql = `
      SELECT id, ai_response_id, organization_id, chunk_id, document_id,
             document_version_id, document_title, page_number, similarity,
             rank, cited_in_answer, snippet, created_at
      FROM ai_response_sources
      WHERE ai_response_id = $1 AND organization_id = $2
      ORDER BY rank ASC;
    `;
    const res = await db.query(sql, [aiResponseId, organizationId]);
    return res.rows.map((row) => ({
      id: row.id,
      aiResponseId: row.ai_response_id,
      organizationId: row.organization_id,
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentVersionId: row.document_version_id,
      documentTitle: row.document_title,
      pageNumber: row.page_number,
      similarity: Number(row.similarity),
      rank: row.rank,
      citedInAnswer: Boolean(row.cited_in_answer),
      snippet: row.snippet,
      createdAt: row.created_at
    }));
  }

  _formatResponse(row, sources = []) {
    return {
      id: row.id,
      ticketId: row.ticket_id,
      organizationId: row.organization_id,
      requestedBy: row.requested_by,
      indexingConfigId: row.indexing_config_id,
      queryText: row.query_text,
      triggerMessageId: row.trigger_message_id,
      outcome: row.outcome,
      draftBody: row.draft_body,
      suggestedCategory: row.suggested_category,
      suggestedPriority: row.suggested_priority,
      reviewStatus: row.review_status,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      finalBody: row.final_body,
      provider: row.provider,
      model: row.model,
      promptVersion: row.prompt_version,
      latencyMs: row.latency_ms,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      topSimilarity: row.top_similarity !== null ? Number(row.top_similarity) : null,
      errorCode: row.error_code,
      sources,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export const aiResponseRepository = new AiResponseRepository();
