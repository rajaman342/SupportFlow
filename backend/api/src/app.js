import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { getConfig, logger } from '@supportflow/shared';
import { requestIdMiddleware } from './middleware/requestId.js';
import { errorHandlerMiddleware } from './middleware/errorHandler.js';
import healthRoutes from './routes/health.js';

export function createApp() {
  const config = getConfig();
  const app = express();

  // Basic security and parsing
  app.use(helmet());
  app.use(
    cors({
      origin: config.CORS_ORIGINS.split(',').map((s) => s.trim()),
      credentials: true
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Attach Request-ID to all incoming requests
  app.use(requestIdMiddleware);

  // Request logger
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info(
        {
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Date.now() - start,
          requestId: req.id
        },
        'HTTP request handled'
      );
    });
    next();
  });

  // Health and Readiness endpoints (mounted at root per API_SPEC §2.6)
  app.use('/', healthRoutes);

  // API v1 prefix (also mount health there for convenience)
  app.use('/api/v1', healthRoutes);

  // 404 handler for undefined routes
  app.use((req, _res, next) => {
    const err = new Error(`Cannot ${req.method} ${req.originalUrl}`);
    err.code = 'NOT_FOUND';
    err.statusCode = 404;
    next(err);
  });

  // Centralized error handler
  app.use(errorHandlerMiddleware);

  return app;
}

export const app = createApp();
