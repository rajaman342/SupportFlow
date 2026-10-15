import { getDatabasePool } from '../db.js';

export class IndexingConfigRepository {
  constructor(pool = null) {
    this.pool = pool || getDatabasePool();
  }

  /**
   * Fetches the currently active indexing config row.
   * Exactly one active row exists guaranteed by partial unique index.
   */
  async getActiveConfig(client = null) {
    const db = client || this.pool;
    const sql = `
      SELECT id, name, provider, model, dimensions, chunk_size_chars, chunk_overlap_chars, status, verified_at, verification_note, created_at
      FROM indexing_configs
      WHERE status = 'active'
      LIMIT 1;
    `;
    const res = await db.query(sql);
    return res.rows[0] || null;
  }

  async getConfigById(id, client = null) {
    const db = client || this.pool;
    const sql = `
      SELECT id, name, provider, model, dimensions, chunk_size_chars, chunk_overlap_chars, status, verified_at, verification_note, created_at
      FROM indexing_configs
      WHERE id = $1;
    `;
    const res = await db.query(sql, [id]);
    return res.rows[0] || null;
  }

  async getConfigByName(name, client = null) {
    const db = client || this.pool;
    const sql = `
      SELECT id, name, provider, model, dimensions, chunk_size_chars, chunk_overlap_chars, status, verified_at, verification_note, created_at
      FROM indexing_configs
      WHERE name = $1;
    `;
    const res = await db.query(sql, [name]);
    return res.rows[0] || null;
  }

  async listConfigs(client = null) {
    const db = client || this.pool;
    const sql = `
      SELECT id, name, provider, model, dimensions, chunk_size_chars, chunk_overlap_chars, status, verified_at, verification_note, created_at
      FROM indexing_configs
      ORDER BY created_at ASC;
    `;
    const res = await db.query(sql);
    return res.rows;
  }
}

export const indexingConfigRepository = new IndexingConfigRepository();
