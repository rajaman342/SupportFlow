import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../backend/api/src/app.js';
import {
  organizationRepository,
  userRepository,
  hashPassword,
  signAccessToken,
  closeDatabasePool
} from '../../backend/shared/src/index.js';

describe('Ticket Domain Integration Tests', () => {
  let app;
  let org;
  let customer, agent1, agent2, admin;
  let tokenCustomer, tokenAgent1, tokenAdmin;

  beforeAll(async () => {
    app = createApp();
    const stamp = Date.now();
    const passHash = await hashPassword('TicketDomainPass123!');

    org = await organizationRepository.create({
      name: `Ticket Org ${stamp}`,
      slug: `ticket-org-${stamp}`
    });

    customer = await userRepository.create({
      organizationId: org.id,
      email: `cust_${stamp}@ticket.test`,
      passwordHash: passHash,
      fullName: 'Customer Test',
      role: 'customer'
    });

    agent1 = await userRepository.create({
      organizationId: org.id,
      email: `agent1_${stamp}@ticket.test`,
      passwordHash: passHash,
      fullName: 'Agent One',
      role: 'agent'
    });

    agent2 = await userRepository.create({
      organizationId: org.id,
      email: `agent2_${stamp}@ticket.test`,
      passwordHash: passHash,
      fullName: 'Agent Two',
      role: 'agent'
    });

    admin = await userRepository.create({
      organizationId: org.id,
      email: `admin_${stamp}@ticket.test`,
      passwordHash: passHash,
      fullName: 'Admin Test',
      role: 'admin'
    });

    tokenCustomer = signAccessToken(customer.id);
    tokenAgent1 = signAccessToken(agent1.id);
    tokenAdmin = signAccessToken(admin.id);
  });

  afterAll(async () => {
    await closeDatabasePool();
  });

  it('Customer creates a ticket and first message atomically', async () => {
    const res = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokenCustomer}`)
      .send({
        subject: 'Cannot login to customer portal after reset',
        body: 'I tried resetting my password and now the portal says invalid session.',
        priority: 'high'
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.subject).toBe('Cannot login to customer portal after reset');
    expect(res.body.data.status).toBe('open');
    expect(res.body.data.priority).toBe('high');
    expect(res.body.data.firstMessage).toBeDefined();
    expect(res.body.data.firstMessage.body).toContain('invalid session');
  });

  it('Enforces assignment RBAC: Agent can only self-assign; Admin can assign others', async () => {
    // 1. Create a ticket
    const ticketRes = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokenCustomer}`)
      .send({
        subject: 'Assignment test ticket',
        body: 'Testing agent self-assignment and admin delegation'
      });

    const ticketId = ticketRes.body.data.id;

    // 2. Agent 1 tries to assign ticket to Agent 2 -> 403 FORBIDDEN
    const agentAssignOtherRes = await request(app)
      .post(`/api/v1/tickets/${ticketId}/assign`)
      .set('Authorization', `Bearer ${tokenAgent1}`)
      .send({ agentId: agent2.id });

    expect(agentAssignOtherRes.status).toBe(403);
    expect(agentAssignOtherRes.body.error.code).toBe('FORBIDDEN');

    // 3. Agent 1 assigns ticket to SELF -> SUCCESS (200)
    const agentSelfAssignRes = await request(app)
      .post(`/api/v1/tickets/${ticketId}/assign`)
      .set('Authorization', `Bearer ${tokenAgent1}`)
      .send({ agentId: agent1.id });

    expect(agentSelfAssignRes.status).toBe(200);
    expect(agentSelfAssignRes.body.data.assigned_agent_id).toBe(agent1.id);

    // 4. Admin re-assigns ticket to Agent 2 -> SUCCESS (200)
    const adminAssignRes = await request(app)
      .post(`/api/v1/tickets/${ticketId}/assign`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ agentId: agent2.id });

    expect(adminAssignRes.status).toBe(200);
    expect(adminAssignRes.body.data.assigned_agent_id).toBe(agent2.id);

    // 5. Admin tries to assign ticket to a customer -> 422 BUSINESS_RULE_VIOLATION
    const invalidAssigneeRes = await request(app)
      .post(`/api/v1/tickets/${ticketId}/assign`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ agentId: customer.id });

    expect(invalidAssigneeRes.status).toBe(422);
    expect(invalidAssigneeRes.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('Enforces status transitions: rejects direct open->resolved without agent response', async () => {
    // Create new open ticket
    const ticketRes = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokenCustomer}`)
      .send({
        subject: 'Direct resolve test ticket',
        body: 'Check that ticket cannot be closed without agent response'
      });

    const ticketId = ticketRes.body.data.id;

    // Direct open -> resolved without agent message -> 409 INVALID_TRANSITION
    const invalidResolveRes = await request(app)
      .post(`/api/v1/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${tokenAgent1}`)
      .send({ status: 'resolved' });

    expect(invalidResolveRes.status).toBe(409);
    expect(invalidResolveRes.body.error.code).toBe('INVALID_TRANSITION');

    // Agent posts reply message
    await request(app)
      .post(`/api/v1/tickets/${ticketId}/messages`)
      .set('Authorization', `Bearer ${tokenAgent1}`)
      .send({ body: 'Official agent response addressing customer concern.' });

    // Now open -> resolved succeeds!
    const validResolveRes = await request(app)
      .post(`/api/v1/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${tokenAgent1}`)
      .send({ status: 'resolved' });

    expect(validResolveRes.status).toBe(200);
    expect(validResolveRes.body.data.status).toBe('resolved');
    expect(validResolveRes.body.data.resolved_at).toBeDefined();
  });

  it('Customer reply on a resolved ticket automatically reopens it (resolved -> open)', async () => {
    // 1. Create and resolve ticket
    const ticketRes = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokenCustomer}`)
      .send({
        subject: 'Reopen test ticket',
        body: 'Will be closed and reopened'
      });
    const ticketId = ticketRes.body.data.id;

    // Agent responds and resolves
    await request(app)
      .post(`/api/v1/tickets/${ticketId}/messages`)
      .set('Authorization', `Bearer ${tokenAgent1}`)
      .send({ body: 'Your issue is resolved.' });

    await request(app)
      .post(`/api/v1/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${tokenAgent1}`)
      .send({ status: 'resolved' });

    // 2. Customer replies on the resolved ticket
    const replyRes = await request(app)
      .post(`/api/v1/tickets/${ticketId}/messages`)
      .set('Authorization', `Bearer ${tokenCustomer}`)
      .send({ body: 'Actually I still have a problem with this.' });

    expect(replyRes.status).toBe(201);

    // 3. Verify ticket status is now open again
    const checkRes = await request(app)
      .get(`/api/v1/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${tokenCustomer}`);

    expect(checkRes.status).toBe(200);
    expect(checkRes.body.data.status).toBe('open');
    expect(checkRes.body.data.resolved_at).toBeNull();
  });

  it('Full-text search finds tickets matching subject keywords', async () => {
    const res = await request(app)
      .get('/api/v1/tickets?q=portal')
      .set('Authorization', `Bearer ${tokenAgent1}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.some((t) => t.subject.includes('portal'))).toBe(true);
  });
});
