import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import { getRedisClient, getConfig, logger } from '@supportflow/shared';

export function createLimiter({ keyPrefix, points, duration }) {
  const config = getConfig();
  const env = config.NODE_ENV || 'development';
  const prefix = `sf:${env}:rl:${keyPrefix}`;

  // In-memory insurance limiter if Redis is offline
  const insuranceLimiter = new RateLimiterMemory({
    points,
    duration
  });

  const redisClient = getRedisClient();

  const redisLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: prefix,
    points,
    duration,
    inmemoryBlockOnConsumed: points + 1,
    insuranceLimiter
  });

  return async (req, res, next) => {
    // Health and readiness checks should never be throttled
    if (req.path === '/health' || req.path === '/ready') {
      return next();
    }

    // In test environment, allow bypassing rate limits unless specifically testing rate limiter
    if (config.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) {
      return next();
    }

    let key = req.ip;
    if (keyPrefix === 'login') {
      const email = (req.body?.email || '').trim().toLowerCase();
      key = `${req.ip}_${email || 'anon'}`;
    } else if (keyPrefix === 'register' || keyPrefix === 'refresh') {
      key = req.ip;
    } else if (req.user?.id) {
      key = req.user.id;
    }

    try {
      await redisLimiter.consume(key, 1);
      next();
    } catch (rejRes) {
      if (rejRes instanceof Error) {
        // Unexpected system error, log and pass through
        logger.warn({ err: rejRes.message }, 'Rate limiter unexpected error; bypassing');
        return next();
      }

      const retryAfterSeconds = Math.max(1, Math.ceil(rejRes.msBeforeNext / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));

      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
          details: {
            retryAfter: retryAfterSeconds
          },
          requestId: req.id || null
        }
      });
    }
  };
}

// 1. Auth limiters
export const loginLimiter = createLimiter({
  keyPrefix: 'login',
  points: 10,
  duration: 900 // 15 min
});

export const registerLimiter = createLimiter({
  keyPrefix: 'register',
  points: 5,
  duration: 3600 // 1 hour
});

export const refreshLimiter = createLimiter({
  keyPrefix: 'refresh',
  points: 60,
  duration: 3600 // 1 hour
});

// 2. General API limiter (300/min)
export const generalApiLimiter = createLimiter({
  keyPrefix: 'api',
  points: 300,
  duration: 60 // 1 min
});

// 3. Document upload limiter (20/hr)
export const documentUploadLimiter = createLimiter({
  keyPrefix: 'upload',
  points: 20,
  duration: 3600 // 1 hour
});

// 4. AI suggestion limiter (AI_REQUESTS_PER_USER_PER_HOUR, default 30/hr)
const config = getConfig();
export const aiSuggestionLimiter = createLimiter({
  keyPrefix: 'ai',
  points: config.AI_REQUESTS_PER_USER_PER_HOUR || 30,
  duration: 3600 // 1 hour
});
