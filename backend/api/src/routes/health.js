import { Router } from 'express';
import { checkDatabaseHealth, checkRedisHealth } from '@supportflow/shared';

const router = Router();

router.get('/health', (_req, res) => {
  res.status(200).json({
    data: {
      status: 'ok'
    }
  });
});

router.get('/ready', async (req, res) => {
  const [dbHealth, redisHealth] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth()
  ]);

  const isReady = dbHealth.ok && redisHealth.ok;
  const requestId = req.id || res.getHeader('X-Request-Id');

  if (isReady) {
    return res.status(200).json({
      data: {
        status: 'ready',
        dependencies: {
          database: true,
          redis: true
        }
      }
    });
  }

  return res.status(503).json({
    error: {
      code: 'DEPENDENCY_UNAVAILABLE',
      message: 'One or more service dependencies are not ready',
      details: {
        database: dbHealth.ok,
        redis: redisHealth.ok
      },
      requestId
    }
  });
});

export default router;
