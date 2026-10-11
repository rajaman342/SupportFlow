import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../backend/api/src/app.js';
import { closeDatabasePool } from '../../backend/shared/src/db.js';

describe('CSRF Security Tests', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  afterAll(async () => {
    await closeDatabasePool();
  });

  it('rejects cookie refresh requests missing X-Requested-With header with 403 CSRF_REJECTED', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'sf_refresh=some_fake_token')
      .set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('CSRF_REJECTED');
  });

  it('rejects cookie refresh requests with unauthorized cross-origin Origin with 403 CSRF_REJECTED', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'sf_refresh=some_fake_token')
      .set('X-Requested-With', 'supportflow')
      .set('Origin', 'http://malicious-phishing-attacker.com');

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('CSRF_REJECTED');
  });

  it('rejects logout requests missing X-Requested-With header with 403 CSRF_REJECTED', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', 'sf_refresh=some_fake_token');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_REJECTED');
  });
});
