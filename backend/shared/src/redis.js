import Redis from 'ioredis';
import { getConfig } from './config.js';
import { logger } from './logger.js';

let redisInstance = null;

export function getRedisClient(customConfig = null) {
  if (!redisInstance || customConfig) {
    const config = customConfig || getConfig();
    const redis = new Redis(config.REDIS_URL, {
      password: config.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: true,
      lazyConnect: true
    });

    redis.on('error', (err) => {
      logger.warn({ err: err.message }, 'Redis client connection error');
    });

    if (!customConfig) {
      redisInstance = redis;
    } else {
      return redis;
    }
  }
  return redisInstance;
}

export async function checkRedisHealth(redis = null, timeoutMs = 2000) {
  const r = redis || getRedisClient();
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Redis health check timed out')), timeoutMs)
  );

  try {
    if (r.status === 'wait') {
      await r.connect();
    }
    const pong = await Promise.race([r.ping(), timeoutPromise]);
    return { ok: pong === 'PONG' };
  } catch (err) {
    logger.warn({ err: err.message }, 'Redis health check failed');
    return { ok: false, error: 'Redis unavailable' };
  }
}

export async function closeRedis(redis = null) {
  const r = redis || redisInstance;
  if (r) {
    try {
      await r.quit();
    } catch {
      r.disconnect();
    }
    if (r === redisInstance) {
      redisInstance = null;
    }
  }
}

export const closeRedisClient = closeRedis;
