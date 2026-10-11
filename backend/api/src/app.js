import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { getConfig, logger } from '@supportflow/shared';
import { requestIdMiddleware } from './middleware/requestId.js';
import { errorHandlerMiddleware } from './middleware/errorHandler.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import ticketRoutes from './routes/ticketRoutes.js';
import auditLogRoutes from './routes/auditLogRoutes.js';

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

  // Health and Readiness endpoints
  app.use('/', healthRoutes);
  app.use('/api/v1', healthRoutes);

  // Authentication endpoints (/auth and /api/v1/auth)
  app.use('/auth', authRoutes);
  app.use('/api/v1/auth', authRoutes);

  // User management endpoints
  app.use('/api/v1/users', userRoutes);

  // Ticketing endpoints
  app.use('/api/v1/tickets', ticketRoutes);

  // Audit log endpoints
  app.use('/api/v1/audit-logs', auditLogRoutes);

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
