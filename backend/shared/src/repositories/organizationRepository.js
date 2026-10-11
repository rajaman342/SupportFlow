import { getDatabasePool } from '../db.js';

export class OrganizationRepository {
  constructor(pool = null) {
    this.pool = pool || getDatabasePool();
  }

  async create({ name, slug }, client = null) {
    const db = client || this.pool;
    const query = `
      INSERT INTO organizations (name, slug)
      VALUES ($1, $2)
      RETURNING id, name, slug, created_at, updated_at
    `;
    const result = await db.query(query, [name, slug]);
    return result.rows[0];
  }

  async findById(id, client = null) {
    const db = client || this.pool;
    const query = `
      SELECT id, name, slug, created_at, updated_at
      FROM organizations
      WHERE id = $1
    `;
    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  }

  async findBySlug(slug, client = null) {
    const db = client || this.pool;
    const query = `
      SELECT id, name, slug, created_at, updated_at
      FROM organizations
      WHERE slug = $1
    `;
    const result = await db.query(query, [slug]);
    return result.rows[0] || null;
  }
}

export const organizationRepository = new OrganizationRepository();
