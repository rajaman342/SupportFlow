import { getDatabasePool } from '../db.js';
import { getConfig } from '../config.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class RetrievalRepository {
  constructor(pool = null) {
    this.pool = pool || getDatabasePool();
  }

  /**
   * Retrieves tenant-scoped candidate chunks matching the query vector,
   * joining only active non-deleted document versions.
   *
   * @param {string} organizationId
   * @param {{ id: string, dimensions: number }} activeConfig
   * @param {number[]} queryVector
   * @param {{ topK?: number, candidateLimit?: number, minSimilarity?: number }} options
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Array<{
   *   chunkId: string,
   *   documentId: string,
   *   documentVersionId: string,
   *   documentTitle: string,
   *   pageNumber: number,
   *   similarity: number,
   *   rank: number,
   *   snippet: string
   * }>>}
   */
  async retrieveCandidates(
    organizationId,
    activeConfig,
    queryVector,
    { topK = null, candidateLimit = null, minSimilarity = null } = {},
    client = null
  ) {
    const config = getConfig();
    const resolvedTopK = topK ?? config.RETRIEVAL_TOP_K ?? 6;
    const resolvedCandidateLimit = candidateLimit ?? config.RETRIEVAL_CANDIDATE_LIMIT ?? 50;
    const resolvedMinSimilarity = minSimilarity ?? config.RETRIEVAL_MIN_SIMILARITY ?? 0.3;

    // Strict validation of activeConfig to guard SQL interpolation for HNSW partial index matching
    if (!activeConfig || !activeConfig.id || !UUID_REGEX.test(activeConfig.id)) {
      throw new Error(`Invalid activeConfig UUID: ${activeConfig?.id}`);
    }

    const dims = parseInt(activeConfig.dimensions, 10);
    if (isNaN(dims) || dims <= 0 || dims > 4000) {
      throw new Error(`Invalid activeConfig dimensions: ${activeConfig?.dimensions}`);
    }

    if (!Array.isArray(queryVector) || queryVector.length !== dims) {
      throw new Error(`Query vector length (${queryVector?.length}) does not match config dimensions (${dims})`);
    }

    const vectorStr = `[${queryVector.join(',')}]`;
    const db = client || this.pool;

    // Note: Dimensions and UUID are strictly validated integers/UUIDs from indexing_configs row.
    // Inlining the dimension expression matches the partial HNSW index definition:
    // USING hnsw ((embedding::vector(${dims})) vector_cosine_ops) WHERE indexing_config_id = '<uuid>'
    const query = `
      WITH candidates AS (
        SELECT c.id, c.document_id, c.document_version_id, c.page_number, c.content,
               (c.embedding::vector(${dims}) <=> $1::vector(${dims})) AS distance
        FROM document_chunks c
        WHERE c.organization_id = $2
          AND c.indexing_config_id = $3
        ORDER BY c.embedding::vector(${dims}) <=> $1::vector(${dims})
        LIMIT $4
      )
      SELECT cand.id AS chunk_id,
             cand.document_id,
             cand.document_version_id,
             cand.page_number,
             cand.content AS snippet,
             cand.distance,
             (1 - cand.distance) AS similarity,
             d.title AS document_title
      FROM candidates cand
      JOIN knowledge_documents d
        ON d.id = cand.document_id
       AND d.active_version_id = cand.document_version_id
       AND d.deleted_at IS NULL
      WHERE d.organization_id = $2
      ORDER BY cand.distance ASC
      LIMIT $5;
    `;

    const res = await db.query(query, [
      vectorStr,
      organizationId,
      activeConfig.id,
      resolvedCandidateLimit,
      resolvedTopK
    ]);

    // Apply similarity threshold and assign 1..k ranks
    const filtered = [];
    let rank = 1;

    for (const row of res.rows) {
      const similarity = Number((1 - Number(row.distance)).toFixed(4));
      if (similarity >= resolvedMinSimilarity) {
        filtered.push({
          chunkId: row.chunk_id,
          documentId: row.document_id,
          documentVersionId: row.document_version_id,
          documentTitle: row.document_title,
          pageNumber: Number(row.page_number),
          similarity,
          rank: rank++,
          snippet: row.snippet
        });
      }
    }

    return filtered;
  }

  /**
   * Generates EXPLAIN output for the retrieval query to verify index usage.
   * @param {string} organizationId
   * @param {{ id: string, dimensions: number }} activeConfig
   * @param {number[]} queryVector
   * @param {{ topK?: number, candidateLimit?: number }} options
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<string>}
   */
  async explainRetrieval(
    organizationId,
    activeConfig,
    queryVector,
    { topK = 6, candidateLimit = 50 } = {},
    client = null
  ) {
    const dims = parseInt(activeConfig.dimensions, 10);
    const vectorStr = `[${queryVector.join(',')}]`;
    const db = client || this.pool;

    const explainSql = `
      EXPLAIN (FORMAT TEXT)
      WITH candidates AS (
        SELECT c.id, c.document_id, c.document_version_id, c.page_number, c.content,
               (c.embedding::vector(${dims}) <=> $1::vector(${dims})) AS distance
        FROM document_chunks c
        WHERE c.organization_id = $2
          AND c.indexing_config_id = $3
        ORDER BY c.embedding::vector(${dims}) <=> $1::vector(${dims})
        LIMIT $4
      )
      SELECT cand.id AS chunk_id,
             cand.document_id,
             cand.document_version_id,
             cand.page_number,
             cand.content AS snippet,
             cand.distance,
             (1 - cand.distance) AS similarity,
             d.title AS document_title
      FROM candidates cand
      JOIN knowledge_documents d
        ON d.id = cand.document_id
       AND d.active_version_id = cand.document_version_id
       AND d.deleted_at IS NULL
      WHERE d.organization_id = $2
      ORDER BY cand.distance ASC
      LIMIT $5;
    `;

    const res = await db.query(explainSql, [
      vectorStr,
      organizationId,
      activeConfig.id,
      candidateLimit,
      topK
    ]);

    return res.rows.map((r) => r['QUERY PLAN']).join('\n');
  }
}

export const retrievalRepository = new RetrievalRepository();
