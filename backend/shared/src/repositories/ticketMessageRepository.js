import { getDatabasePool } from '../db.js';

export class TicketMessageRepository {
  constructor(pool = null) {
    this.pool = pool || getDatabasePool();
  }

  async create(
    {
      ticketId,
      organizationId,
      authorId,
      authorRole,
      body,
      source = 'human',
      aiResponseId = null
    },
    client = null
  ) {
    const db = client || this.pool;
    const query = `
      INSERT INTO ticket_messages (ticket_id, organization_id, author_id, author_role, body, source, ai_response_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, ticket_id, organization_id, author_id, author_role, body, source, ai_response_id, created_at
    `;
    const result = await db.query(query, [
      ticketId,
      organizationId,
      authorId,
      authorRole,
      body,
      source,
      aiResponseId
    ]);
    return result.rows[0];
  }

  async listByTicketId(
    { ticketId, organizationId, customerId = null, page = 1, limit = 50 },
    client = null
  ) {
    const db = client || this.pool;

    // Verify ticket scope first
    const ticketCheckConditions = ['t.id = $1', 't.organization_id = $2'];
    const checkValues = [ticketId, organizationId];
    if (customerId) {
      ticketCheckConditions.push('t.customer_id = $3');
      checkValues.push(customerId);
    }

    const checkQuery = `
      SELECT t.id FROM tickets t WHERE ${ticketCheckConditions.join(' AND ')}
    `;
    const checkRes = await db.query(checkQuery, checkValues);
    if (!checkRes.rows.length) {
      return null; // Not found in scope
    }

    // Count messages
    const countQuery = `
      SELECT count(*)::int AS total
      FROM ticket_messages
      WHERE ticket_id = $1 AND organization_id = $2
    `;
    const countRes = await db.query(countQuery, [ticketId, organizationId]);
    const total = countRes.rows[0]?.total || 0;

    const offset = (page - 1) * limit;
    const query = `
      SELECT m.id, m.ticket_id, m.organization_id, m.author_id, m.author_role,
             m.body, m.source, m.ai_response_id, m.created_at,
             json_build_object('id', u.id, 'fullName', u.full_name, 'role', u.role) AS author
      FROM ticket_messages m
      JOIN users u ON u.id = m.author_id
      WHERE m.ticket_id = $1 AND m.organization_id = $2
      ORDER BY m.created_at ASC
      LIMIT $3 OFFSET $4
    `;
    const result = await db.query(query, [ticketId, organizationId, limit, offset]);

    return {
      messages: result.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }
}

export const ticketMessageRepository = new TicketMessageRepository();
