import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import * as shared from '@supportflow/shared';
import { createApp } from '../app.js';

describe('Health and Readiness Endpoints', () => {
  let app;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
  });

  it('GET /health returns 200 with status ok and X-Request-Id header', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        status: 'ok'
      }
    });
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('GET /ready returns 200 when all dependencies are healthy', async () => {
    vi.spyOn(shared, 'checkDatabaseHealth').mockResolvedValue({ ok: true });
    vi.spyOn(shared, 'checkRedisHealth').mockResolvedValue({ ok: true });

    const res = await request(app).get('/ready');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        status: 'ready',
        dependencies: {
          database: true,
          redis: true
        }
      }
    });
  });

  it('GET /ready returns 503 when Redis is down', async () => {
    vi.spyOn(shared, 'checkDatabaseHealth').mockResolvedValue({ ok: true });
    vi.spyOn(shared, 'checkRedisHealth').mockResolvedValue({ ok: false, error: 'Connection refused' });

    const res = await request(app).get('/ready');

    expect(res.status).toBe(503);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(res.body.error.details).toEqual({
      database: true,
      redis: false
    });
  });

  it('GET /ready returns 503 when Database is down', async () => {
    vi.spyOn(shared, 'checkDatabaseHealth').mockResolvedValue({ ok: false, error: 'DB timeout' });
    vi.spyOn(shared, 'checkRedisHealth').mockResolvedValue({ ok: true });

    const res = await request(app).get('/ready');

    expect(res.status).toBe(503);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(res.body.error.details).toEqual({
      database: false,
      redis: true
    });
  });
});
