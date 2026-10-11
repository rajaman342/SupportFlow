import { getDatabasePool } from '../db.js';

const ALLOWED_SORT_COLUMNS = new Set(['created_at', 'updated_at', 'priority', 'status', 'subject']);

export class TicketRepository {
  constructor(pool = null) {
    this.pool = pool || getDatabasePool();
  }

  async createWithFirstMessage(
    { organizationId, customerId, subject, body, priority = 'medium' },
    client = null
  ) {
    const shouldManageTx = !client;
    const tx = client || (await this.pool.connect());

    try {
      if (shouldManageTx) await tx.query('BEGIN');

      // 1. Insert ticket
      const ticketQuery = `
        INSERT INTO tickets (organization_id, customer_id, subject, priority, status)
        VALUES ($1, $2, $3, $4, 'open')
        RETURNING id, organization_id, customer_id, assigned_agent_id, subject, status, priority, category, resolved_at, created_at, updated_at
      `;
      const ticketRes = await tx.query(ticketQuery, [
        organizationId,
        customerId,
        subject,
        priority
      ]);
      const ticket = ticketRes.rows[0];

      // 2. Insert first message
      const messageQuery = `
        INSERT INTO ticket_messages (ticket_id, organization_id, author_id, author_role, body, source)
        VALUES ($1, $2, $3, 'customer', $4, 'human')
        RETURNING id, ticket_id, organization_id, author_id, author_role, body, source, created_at
      `;
      const messageRes = await tx.query(messageQuery, [
        ticket.id,
        organizationId,
        customerId,
        body
      ]);
      const message = messageRes.rows[0];

      if (shouldManageTx) await tx.query('COMMIT');
      return { ticket, message };
    } catch (err) {
      if (shouldManageTx) await tx.query('ROLLBACK');
      throw err;
    } finally {
      if (shouldManageTx) tx.release();
    }
  }

  async findById(id, organizationId, customerId = null, client = null) {
    const db = client || this.pool;
    const conditions = ['t.id = $1', 't.organization_id = $2'];
    const values = [id, organizationId];

    if (customerId) {
      conditions.push('t.customer_id = $3');
      values.push(customerId);
    }

    const query = `
      SELECT t.id, t.organization_id, t.customer_id, t.assigned_agent_id,
             t.subject, t.status, t.priority, t.category, t.resolved_at,
             t.created_at, t.updated_at,
             json_build_object('id', u.id, 'fullName', u.full_name, 'email', u.email) AS customer,
             CASE
               WHEN a.id IS NOT NULL THEN json_build_object('id', a.id, 'fullName', a.full_name, 'email', a.email)
               ELSE NULL
             END AS "assignedAgent"
      FROM tickets t
      JOIN users u ON u.id = t.customer_id
      LEFT JOIN users a ON a.id = t.assigned_agent_id
      WHERE ${conditions.join(' AND ')}
    `;

    const result = await db.query(query, values);
    return result.rows[0] || null;
  }

  async listTickets(
    {
      organizationId,
      customerId = null,
      q = null,
      status = null,
      priority = null,
      assigneeId = null,
      assignedToMe = false,
      agentUserId = null,
      sort = '-created_at',
      page = 1,
      limit = 20
    },
    client = null
  ) {
    const db = client || this.pool;
    const conditions = ['t.organization_id = $1'];
    const values = [organizationId];
    let paramIndex = 2;

    if (customerId) {
      conditions.push(`t.customer_id = $${paramIndex}`);
      values.push(customerId);
      paramIndex++;
    }

    if (q) {
      conditions.push(`t.search_tsv @@ plainto_tsquery('english', $${paramIndex})`);
      values.push(q);
      paramIndex++;
    }

    if (status) {
      conditions.push(`t.status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }

    if (priority) {
      conditions.push(`t.priority = $${paramIndex}`);
      values.push(priority);
      paramIndex++;
    }

    if (assigneeId) {
      conditions.push(`t.assigned_agent_id = $${paramIndex}`);
      values.push(assigneeId);
      paramIndex++;
    }

    if (assignedToMe && agentUserId) {
      conditions.push(`t.assigned_agent_id = $${paramIndex}`);
      values.push(agentUserId);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Count
    const countQuery = `SELECT count(*)::int AS total FROM tickets t WHERE ${whereClause}`;
    const countRes = await db.query(countQuery, values);
    const total = countRes.rows[0]?.total || 0;

    // Sort validation
    let sortColumn = 'created_at';
    let sortDirection = 'DESC';
    if (sort) {
      const isDesc = sort.startsWith('-');
      const col = isDesc ? sort.slice(1) : sort;
      if (ALLOWED_SORT_COLUMNS.has(col)) {
        sortColumn = col;
        sortDirection = isDesc ? 'DESC' : 'ASC';
      }
    }

    const offset = (page - 1) * limit;
    const dataQuery = `
      SELECT t.id, t.organization_id, t.customer_id, t.assigned_agent_id,
             t.subject, t.status, t.priority, t.category, t.resolved_at,
             t.created_at, t.updated_at,
             json_build_object('id', u.id, 'fullName', u.full_name) AS customer,
             CASE
               WHEN a.id IS NOT NULL THEN json_build_object('id', a.id, 'fullName', a.full_name)
               ELSE NULL
             END AS "assignedAgent"
      FROM tickets t
      JOIN users u ON u.id = t.customer_id
      LEFT JOIN users a ON a.id = t.assigned_agent_id
      WHERE ${whereClause}
      ORDER BY t.${sortColumn} ${sortDirection}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataRes = await db.query(dataQuery, [...values, limit, offset]);

    return {
      tickets: dataRes.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async updateTicket(id, organizationId, { priority, category }, client = null) {
    const db = client || this.pool;
    const updates = ['updated_at = now()'];
    const values = [id, organizationId];
    let paramIndex = 3;

    if (priority !== undefined) {
      updates.push(`priority = $${paramIndex}`);
      values.push(priority);
      paramIndex++;
    }

    if (category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      values.push(category);
      paramIndex++;
    }

    const query = `
      UPDATE tickets
      SET ${updates.join(', ')}
      WHERE id = $1 AND organization_id = $2
      RETURNING id, organization_id, customer_id, assigned_agent_id, subject, status, priority, category, resolved_at, created_at, updated_at
    `;

    const result = await db.query(query, values);
    return result.rows[0] || null;
  }

  async updateStatus(id, organizationId, status, resolvedAt, client = null) {
    const db = client || this.pool;
    const query = `
      UPDATE tickets
      SET status = $1, resolved_at = $2, updated_at = now()
      WHERE id = $3 AND organization_id = $4
      RETURNING id, organization_id, customer_id, assigned_agent_id, subject, status, priority, category, resolved_at, created_at, updated_at
    `;
    const result = await db.query(query, [status, resolvedAt, id, organizationId]);
    return result.rows[0] || null;
  }

  async updateAssignee(id, organizationId, assignedAgentId, client = null) {
    const db = client || this.pool;
    const query = `
      UPDATE tickets
      SET assigned_agent_id = $1, updated_at = now()
      WHERE id = $2 AND organization_id = $3
      RETURNING id, organization_id, customer_id, assigned_agent_id, subject, status, priority, category, resolved_at, created_at, updated_at
    `;
    const result = await db.query(query, [assignedAgentId, id, organizationId]);
    return result.rows[0] || null;
  }

  async hasAgentMessage(ticketId, organizationId, client = null) {
    const db = client || this.pool;
    const query = `
      SELECT EXISTS (
        SELECT 1 FROM ticket_messages
        WHERE ticket_id = $1 AND organization_id = $2 AND author_role IN ('agent', 'admin')
      ) AS has_agent_msg
    `;
    const result = await db.query(query, [ticketId, organizationId]);
    return result.rows[0]?.has_agent_msg || false;
  }
}

export const ticketRepository = new TicketRepository();
