import { getDatabasePool } from '../db.js';

export class UserRepository {
  constructor(pool = null) {
    this.pool = pool || getDatabasePool();
  }

  async create({ organizationId, email, passwordHash, fullName, role }, client = null) {
    const db = client || this.pool;
    const query = `
      INSERT INTO users (organization_id, email, password_hash, full_name, role)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, organization_id, email, full_name, role, is_active, password_changed_at, created_at, updated_at
    `;
    const result = await db.query(query, [organizationId, email, passwordHash, fullName, role]);
    return result.rows[0];
  }

  async findById(id, client = null) {
    const db = client || this.pool;
    const query = `
      SELECT id, organization_id, email, full_name, role, is_active, password_changed_at, created_at, updated_at
      FROM users
      WHERE id = $1
    `;
    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByIdWithPasswordHash(id, client = null) {
    const db = client || this.pool;
    const query = `
      SELECT id, organization_id, email, password_hash, full_name, role, is_active, password_changed_at, created_at, updated_at
      FROM users
      WHERE id = $1
    `;
    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByEmail(organizationId, email, client = null) {
    const db = client || this.pool;
    const query = `
      SELECT id, organization_id, email, password_hash, full_name, role, is_active, password_changed_at, created_at, updated_at
      FROM users
      WHERE organization_id = $1 AND email = $2
    `;
    const result = await db.query(query, [organizationId, email]);
    return result.rows[0] || null;
  }

  async findByEmailFirst(email, client = null) {
    const db = client || this.pool;
    const query = `
      SELECT id, organization_id, email, password_hash, full_name, role, is_active, password_changed_at, created_at, updated_at
      FROM users
      WHERE email = $1
      ORDER BY created_at ASC
      LIMIT 1
    `;
    const result = await db.query(query, [email]);
    return result.rows[0] || null;
  }

  async listUsers({ organizationId, q = null, role = null, active = null, page = 1, limit = 20 }, client = null) {
    const db = client || this.pool;
    const conditions = ['organization_id = $1'];
    const values = [organizationId];
    let paramIndex = 2;

    if (q) {
      conditions.push(`(full_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
      values.push(`%${q}%`);
      paramIndex++;
    }

    if (role) {
      conditions.push(`role = $${paramIndex}`);
      values.push(role);
      paramIndex++;
    }

    if (active !== null && active !== undefined) {
      conditions.push(`is_active = $${paramIndex}`);
      values.push(active);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Total count
    const countQuery = `SELECT count(*)::int AS total FROM users WHERE ${whereClause}`;
    const countRes = await db.query(countQuery, values);
    const total = countRes.rows[0]?.total || 0;

    // Paginated results
    const offset = (page - 1) * limit;
    const dataQuery = `
      SELECT id, organization_id, email, full_name, role, is_active, created_at, updated_at
      FROM users
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const dataRes = await db.query(dataQuery, [...values, limit, offset]);

    return {
      users: dataRes.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async updateRole(id, organizationId, role, client = null) {
    const db = client || this.pool;
    const query = `
      UPDATE users
      SET role = $1, updated_at = now()
      WHERE id = $2 AND organization_id = $3
      RETURNING id, organization_id, email, full_name, role, is_active, created_at, updated_at
    `;
    const result = await db.query(query, [role, id, organizationId]);
    return result.rows[0] || null;
  }

  async updateActive(id, organizationId, isActive, client = null) {
    const db = client || this.pool;
    const query = `
      UPDATE users
      SET is_active = $1, updated_at = now()
      WHERE id = $2 AND organization_id = $3
      RETURNING id, organization_id, email, full_name, role, is_active, created_at, updated_at
    `;
    const result = await db.query(query, [isActive, id, organizationId]);
    return result.rows[0] || null;
  }

  async updatePassword(id, passwordHash, client = null) {
    const db = client || this.pool;
    const query = `
      UPDATE users
      SET password_hash = $1, password_changed_at = now(), updated_at = now()
      WHERE id = $2
      RETURNING id, organization_id, email, full_name, role, is_active, password_changed_at, updated_at
    `;
    const result = await db.query(query, [passwordHash, id]);
    return result.rows[0] || null;
  }

  async countActiveAdmins(organizationId, client = null) {
    const db = client || this.pool;
    const query = `
      SELECT count(*)::int AS count
      FROM users
      WHERE organization_id = $1 AND role = 'admin' AND is_active = true
    `;
    const result = await db.query(query, [organizationId]);
    return result.rows[0]?.count || 0;
  }
}

export const userRepository = new UserRepository();
