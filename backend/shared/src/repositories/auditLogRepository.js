import { getDatabasePool } from '../db.js';

export class AuditLogRepository {
  constructor(pool = null) {
    this.pool = pool || getDatabasePool();
  }

  async create(
    {
      organizationId,
      actorId = null,
      action,
      entityType,
      entityId = null,
      metadata = {},
      requestId = null,
      ip = null
    },
    client = null
  ) {
    const db = client || this.pool;
    const query = `
      INSERT INTO audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata, request_id, ip)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, organization_id, actor_id, action, entity_type, entity_id, metadata, request_id, ip, created_at
    `;
    const result = await db.query(query, [
      organizationId,
      actorId,
      action,
      entityType,
      entityId,
      JSON.stringify(metadata),
      requestId,
      ip
    ]);
    return result.rows[0];
  }

  async list(
    {
      organizationId,
      action = null,
      entityType = null,
      actorId = null,
      from = null,
      to = null,
      page = 1,
      limit = 20
    },
    client = null
  ) {
    const db = client || this.pool;
    const conditions = ['organization_id = $1'];
    const values = [organizationId];
    let paramIndex = 2;

    if (action) {
      conditions.push(`action = $${paramIndex}`);
      values.push(action);
      paramIndex++;
    }

    if (entityType) {
      conditions.push(`entity_type = $${paramIndex}`);
      values.push(entityType);
      paramIndex++;
    }

    if (actorId) {
      conditions.push(`actor_id = $${paramIndex}`);
      values.push(actorId);
      paramIndex++;
    }

    if (from) {
      conditions.push(`created_at >= $${paramIndex}`);
      values.push(from);
      paramIndex++;
    }

    if (to) {
      conditions.push(`created_at <= $${paramIndex}`);
      values.push(to);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const countQuery = `SELECT count(*)::int AS total FROM audit_logs WHERE ${whereClause}`;
    const countRes = await db.query(countQuery, values);
    const total = countRes.rows[0]?.total || 0;

    const offset = (page - 1) * limit;
    const dataQuery = `
      SELECT id, organization_id, actor_id, action, entity_type, entity_id, metadata, request_id, ip, created_at
      FROM audit_logs
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const dataRes = await db.query(dataQuery, [...values, limit, offset]);

    return {
      auditLogs: dataRes.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }
}

export const auditLogRepository = new AuditLogRepository();
