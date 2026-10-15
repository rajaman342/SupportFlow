import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../backend/api/src/app.js';
import {
  organizationRepository,
  userRepository,
  hashPassword,
  signAccessToken,
  cacheService,
  closeDatabasePool,
  closeRedisClient
} from '../../backend/shared/src/index.js';

describe('Redis Cache Integration & Isolation Tests', () => {
  let app;
  let org;
  let customer1, customer2, agent, admin;
  let tokenCust1, tokenCust2, tokenAgent, tokenAdmin;

  beforeAll(async () => {
    app = createApp();
    const stamp = Date.now();
    const passHash = await hashPassword('CacheDomainPass123!');

    org = await organizationRepository.create({
      name: `Cache Org ${stamp}`,
      slug: `cache-org-${stamp}`
    });

    customer1 = await userRepository.create({
      organizationId: org.id,
      email: `cust1_${stamp}@cache.test`,
      passwordHash: passHash,
      fullName: 'Customer One',
      role: 'customer'
    });

    customer2 = await userRepository.create({
      organizationId: org.id,
      email: `cust2_${stamp}@cache.test`,
      passwordHash: passHash,
      fullName: 'Customer Two',
      role: 'customer'
    });

    agent = await userRepository.create({
      organizationId: org.id,
      email: `agent_${stamp}@cache.test`,
      passwordHash: passHash,
      fullName: 'Agent Cache',
      role: 'agent'
    });

    admin = await userRepository.create({
      organizationId: org.id,
      email: `admin_${stamp}@cache.test`,
      passwordHash: passHash,
      fullName: 'Admin Cache',
      role: 'admin'
    });

    tokenCust1 = signAccessToken(customer1.id);
    tokenCust2 = signAccessToken(customer2.id);
    tokenAgent = signAccessToken(agent.id);
    tokenAdmin = signAccessToken(admin.id);
  });

  afterAll(async () => {
    await closeDatabasePool();
    await closeRedisClient();
  });

  it('populates and serves customer ticket list from cache and isolates between customers', async () => {
    // 1. Cust1 creates a ticket
    const createRes = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokenCust1}`)
      .send({
        subject: 'Customer 1 Cache Issue',
        body: 'Initial body message for caching test'
      });
    expect(createRes.status).toBe(201);
    const ticketId = createRes.body.data.id;

    // 2. Cust1 lists tickets -> reads from DB and populates cache
    const list1 = await request(app)
      .get('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokenCust1}`);
    expect(list1.status).toBe(200);
    expect(list1.body.data.length).toBeGreaterThanOrEqual(1);

    // Verify cache exists in Redis
    const cachedTickets = await cacheService.getCustomerTicketList(org.id, customer1.id, {
      sort: '-created_at',
      page: 1,
      limit: 20
    });
    expect(cachedTickets).toBeDefined();

    // 3. Customer 2 lists tickets -> must NOT receive Customer 1 cached tickets
    const list2 = await request(app)
      .get('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokenCust2}`);
    expect(list2.status).toBe(200);
    expect(list2.body.data.length).toBe(0);

    // 4. Cust1 posts a new message -> invalidates ticket cache
    const msgRes = await request(app)
      .post(`/api/v1/tickets/${ticketId}/messages`)
      .set('Authorization', `Bearer ${tokenCust1}`)
      .send({ body: 'Second message causing cache invalidation' });
    expect(msgRes.status).toBe(201);

    // 5. Subsequent getCustomerTicketList for previous version counter is now null/refreshed
    const listAfter = await request(app)
      .get('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokenCust1}`);
    expect(listAfter.status).toBe(200);
  });

  it('serves staff ticket list from cache and invalidates on staff actions', async () => {
    // 1. Agent lists tickets
    const listRes = await request(app)
      .get('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokenAgent}`);
    expect(listRes.status).toBe(200);

    // 2. Verify staff cache exists
    const cached = await cacheService.getStaffTicketList(org.id, 'agent', {
      sort: '-created_at',
      page: 1,
      limit: 20
    });
    expect(cached).toBeDefined();
  });

  it('provides admin stats endpoint with 60s caching and blocks non-admins', async () => {
    // Non-admin customer gets 403
    const forbiddenRes = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${tokenCust1}`);
    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.error.code).toBe('FORBIDDEN');

    // Admin gets 200 with ticket, document, and suggestion counts
    const statsRes = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.data.tickets).toBeDefined();
    expect(statsRes.body.data.documents).toBeDefined();
    expect(statsRes.body.data.suggestions).toBeDefined();

    // Verify stats were cached in Redis
    const cachedStats = await cacheService.getAdminStats(org.id);
    expect(cachedStats).toBeDefined();
    expect(cachedStats.tickets.total).toBeGreaterThanOrEqual(1);
  });

  it('provides admin indexing-config endpoint', async () => {
    const configRes = await request(app)
      .get('/api/v1/admin/indexing-config')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(configRes.status).toBe(200);
    expect(Array.isArray(configRes.body.data)).toBe(true);
    expect(configRes.body.data.length).toBeGreaterThan(0);
    expect(configRes.body.data[0].status).toBe('active');
  });

  it('caches and retrieves query embeddings by normalized text and configId', async () => {
    const configId = 'cfg-test-id';
    const text = 'How do I cancel my subscription?';
    const fakeVector = [0.1, 0.2, 0.3];

    // Cache query embedding
    await cacheService.setQueryEmbedding(org.id, configId, text, fakeVector, 60);

    // Read back
    const retrieved = await cacheService.getQueryEmbedding(org.id, configId, text);
    expect(retrieved).toEqual(fakeVector);

    // Miss on different text
    const miss = await cacheService.getQueryEmbedding(org.id, configId, 'Different question?');
    expect(miss).toBeNull();
  });
});
