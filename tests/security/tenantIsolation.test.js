import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../backend/api/src/app.js';
import {
  organizationRepository,
  userRepository,
  ticketRepository,
  hashPassword,
  signAccessToken,
  closeDatabasePool
} from '../../backend/shared/src/index.js';

describe('Tenant and Customer Isolation Security Tests', () => {
  let app;
  let orgA, orgB;
  let custA, custB;
  let agentA, agentB;
  let adminB;
  let ticketA, ticketB;
  let tokenCustA, tokenCustB;
  let tokenAgentB;
  let tokenAdminB;

  beforeAll(async () => {
    app = createApp();
    const stamp = Date.now();
    const passHash = await hashPassword('TenantIsolationPass123!');

    // 1. Setup Org A and Org B
    orgA = await organizationRepository.create({
      name: `Org Alpha ${stamp}`,
      slug: `org-alpha-${stamp}`
    });
    orgB = await organizationRepository.create({
      name: `Org Beta ${stamp}`,
      slug: `org-beta-${stamp}`
    });

    // 2. Setup Users in Org A
    custA = await userRepository.create({
      organizationId: orgA.id,
      email: `custA_${stamp}@alpha.test`,
      passwordHash: passHash,
      fullName: 'Customer Alpha',
      role: 'customer'
    });
    agentA = await userRepository.create({
      organizationId: orgA.id,
      email: `agentA_${stamp}@alpha.test`,
      passwordHash: passHash,
      fullName: 'Agent Alpha',
      role: 'agent'
    });

    // 3. Setup Users in Org B
    custB = await userRepository.create({
      organizationId: orgB.id,
      email: `custB_${stamp}@beta.test`,
      passwordHash: passHash,
      fullName: 'Customer Beta',
      role: 'customer'
    });
    agentB = await userRepository.create({
      organizationId: orgB.id,
      email: `agentB_${stamp}@beta.test`,
      passwordHash: passHash,
      fullName: 'Agent Beta',
      role: 'agent'
    });
    adminB = await userRepository.create({
      organizationId: orgB.id,
      email: `adminB_${stamp}@beta.test`,
      passwordHash: passHash,
      fullName: 'Admin Beta',
      role: 'admin'
    });

    // Tokens
    tokenCustA = signAccessToken(custA.id);
    tokenCustB = signAccessToken(custB.id);
    tokenAgentB = signAccessToken(agentB.id);
    tokenAdminB = signAccessToken(adminB.id);

    // 4. Create Tickets
    const resA = await ticketRepository.createWithFirstMessage({
      organizationId: orgA.id,
      customerId: custA.id,
      subject: 'Secret Ticket Alpha in Org A',
      body: 'Confidential corporate policy data for Org Alpha',
      priority: 'high'
    });
    ticketA = resA.ticket;

    const resB = await ticketRepository.createWithFirstMessage({
      organizationId: orgB.id,
      customerId: custB.id,
      subject: 'Ticket Beta in Org B',
      body: 'Regular message in Org B',
      priority: 'medium'
    });
    ticketB = resB.ticket;
  });

  afterAll(async () => {
    await closeDatabasePool();
  });

  it('Customer B cannot read Customer A ticket in same/different org and receives 404 NOT_FOUND', async () => {
    // Non-negotiable security rule: returns 404, never 403, so existence of foreign resources is not disclosed
    const res = await request(app)
      .get(`/api/v1/tickets/${ticketA.id}`)
      .set('Authorization', `Bearer ${tokenCustB}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('Customer B ticket list strictly excludes Customer A tickets', async () => {
    const res = await request(app)
      .get('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokenCustB}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((t) => t.id);
    expect(ids).toContain(ticketB.id);
    expect(ids).not.toContain(ticketA.id);
  });

  it('Agent B in Org B cannot read Org A ticket and receives 404 NOT_FOUND', async () => {
    const res = await request(app)
      .get(`/api/v1/tickets/${ticketA.id}`)
      .set('Authorization', `Bearer ${tokenAgentB}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('Agent B ticket list strictly excludes tickets belonging to Org A', async () => {
    const res = await request(app)
      .get('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokenAgentB}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((t) => t.id);
    expect(ids).toContain(ticketB.id);
    expect(ids).not.toContain(ticketA.id);
  });

  it('Agent B cannot message a ticket in Org A and receives 404 NOT_FOUND', async () => {
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketA.id}/messages`)
      .set('Authorization', `Bearer ${tokenAgentB}`)
      .send({ body: 'Malicious cross-org message' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('Admin B listing users only sees users in Org B, never Org A users', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokenAdminB}`);

    expect(res.status).toBe(200);
    const emails = res.body.data.map((u) => u.email);
    expect(emails).toContain(custB.email);
    expect(emails).not.toContain(custA.email);
    expect(emails).not.toContain(agentA.email);
  });

  it('Enforces RBAC: Customer cannot access admin user-management routes (403 FORBIDDEN)', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokenCustA}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
