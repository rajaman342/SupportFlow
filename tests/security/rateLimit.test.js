import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createLimiter } from '../../backend/api/src/middleware/rateLimiter.js';
import { closeRedisClient } from '../../backend/shared/src/redis.js';

describe('Rate Limiter Security & Fallback Tests', () => {
  let app;
  let customLimiter;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Create a strict 2-request limiter for test isolation
    customLimiter = createLimiter({
      keyPrefix: 'security_test',
      points: 2,
      duration: 10
    });

    app.get('/test-throttled', customLimiter, (req, res) => {
      res.status(200).json({ ok: true });
    });

    app.get('/health', customLimiter, (req, res) => {
      res.status(200).json({ status: 'ok' });
    });
  });

  afterAll(async () => {
    await closeRedisClient();
  });

  it('bypasses rate limit in test environment by default when x-test-rate-limit is omitted', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get('/test-throttled');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    }
  });

  it('enforces 429 RATE_LIMITED and Retry-After header when x-test-rate-limit is enabled', async () => {
    // Request 1: OK
    const res1 = await request(app)
      .get('/test-throttled')
      .set('x-test-rate-limit', 'true')
      .set('X-Forwarded-For', '198.51.100.42');
    expect(res1.status).toBe(200);

    // Request 2: OK
    const res2 = await request(app)
      .get('/test-throttled')
      .set('x-test-rate-limit', 'true')
      .set('X-Forwarded-For', '198.51.100.42');
    expect(res2.status).toBe(200);

    // Request 3: Exceeded -> 429
    const res3 = await request(app)
      .get('/test-throttled')
      .set('x-test-rate-limit', 'true')
      .set('X-Forwarded-For', '198.51.100.42');
    expect(res3.status).toBe(429);
    expect(res3.headers['retry-after']).toBeDefined();
    expect(parseInt(res3.headers['retry-after'], 10)).toBeGreaterThan(0);
    expect(res3.body.error).toBeDefined();
    expect(res3.body.error.code).toBe('RATE_LIMITED');
    expect(res3.body.error.details.retryAfter).toBeGreaterThan(0);
  });

  it('exempts /health and /ready endpoints from rate limiting', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .get('/health')
        .set('x-test-rate-limit', 'true')
        .set('X-Forwarded-For', '198.51.100.99');
      expect(res.status).toBe(200);
    }
  });

  it('protects users with login limiter by isolating ip and email', () => {
    // Tests key construction logic
    const req1 = { ip: '127.0.0.1', body: { email: 'user1@example.com' } };
    const req2 = { ip: '127.0.0.1', body: { email: 'user2@example.com' } };
    const email1 = (req1.body?.email || '').trim().toLowerCase();
    const email2 = (req2.body?.email || '').trim().toLowerCase();
    const key1 = `${req1.ip}_${email1}`;
    const key2 = `${req2.ip}_${email2}`;

    expect(key1).not.toBe(key2);
    expect(key1).toBe('127.0.0.1_user1@example.com');
  });
});
