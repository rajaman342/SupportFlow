import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandlerMiddleware } from '../../backend/api/src/middleware/errorHandler.js';
import {
  DatabaseUnavailableError,
  QueueUnavailableError,
  StorageUnavailableError,
  AiProviderUnavailableError,
  closeDatabasePool,
  closeRedisClient
} from '../../backend/shared/src/index.js';

describe('Reliability & Dependency Failure Tests (ARCHITECTURE.md §10)', () => {
  let testApp;

  beforeAll(() => {
    // Mock Express app to simulate dependency failures into the centralized error handler
    testApp = express();
    testApp.use(express.json());

    testApp.get('/test/db-fail', () => {
      throw new DatabaseUnavailableError('Database service unavailable');
    });

    testApp.get('/test/pg-econnrefused', () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:5432');
      err.code = 'ECONNREFUSED';
      throw err;
    });

    testApp.get('/test/queue-fail', () => {
      throw new QueueUnavailableError('Queue service unavailable');
    });

    testApp.get('/test/storage-fail', () => {
      throw new StorageUnavailableError('Storage service unavailable');
    });

    testApp.get('/test/ai-fail', () => {
      throw new AiProviderUnavailableError('AI service unavailable');
    });

    testApp.use(errorHandlerMiddleware);
  });

  afterAll(async () => {
    await closeDatabasePool();
    await closeRedisClient();
  });

  it('returns 503 DATABASE_UNAVAILABLE when database is unreachable', async () => {
    const res = await request(testApp).get('/test/db-fail');
    expect(res.status).toBe(503);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(res.body.error.message).toBe('Database service unavailable');
  });

  it('translates ECONNREFUSED connection drops into 503 DATABASE_UNAVAILABLE', async () => {
    const res = await request(testApp).get('/test/pg-econnrefused');
    expect(res.status).toBe(503);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
  });

  it('returns 503 QUEUE_UNAVAILABLE when queue service is down', async () => {
    const res = await request(testApp).get('/test/queue-fail');
    expect(res.status).toBe(503);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('QUEUE_UNAVAILABLE');
    expect(res.body.error.message).toBe('Queue service unavailable');
  });

  it('returns 503 STORAGE_UNAVAILABLE when document storage is down', async () => {
    const res = await request(testApp).get('/test/storage-fail');
    expect(res.status).toBe(503);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('STORAGE_UNAVAILABLE');
    expect(res.body.error.message).toBe('Storage service unavailable');
  });

  it('returns 503 AI_PROVIDER_UNAVAILABLE when LLM or embeddings fail', async () => {
    const res = await request(testApp).get('/test/ai-fail');
    expect(res.status).toBe(503);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('AI_PROVIDER_UNAVAILABLE');
    expect(res.body.error.message).toBe('AI service unavailable');
  });
});
