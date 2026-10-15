import { AppError, logger } from '@supportflow/shared';

export function errorHandlerMiddleware(err, req, res, _next) {
  const requestId = req.id || res.getHeader('X-Request-Id');

  if (err instanceof AppError) {
    logger.warn(
      {
        err: {
          code: err.code,
          message: err.message,
          statusCode: err.statusCode,
          details: err.details
        },
        requestId,
        path: req.originalUrl,
        method: req.method
      },
      'Application error handled'
    );

    return res.status(err.statusCode).json(err.toJSON(requestId));
  }

  // Translate unhandled connection errors to standard 503 envelopes per ARCHITECTURE.md §10
  if (
    err.code === 'ECONNREFUSED' ||
    err.code === 'ENOTFOUND' ||
    err.code === '57P01' ||
    err.code === '57P02' ||
    err.code === '57P03' ||
    (typeof err.message === 'string' && (
      err.message.includes('Connection terminated unexpectedly') ||
      err.message.includes('connect ECONNREFUSED')
    ))
  ) {
    const isQueue = typeof err.message === 'string' && (
      err.message.toLowerCase().includes('redis') ||
      err.message.toLowerCase().includes('queue')
    );
    const code = isQueue ? 'QUEUE_UNAVAILABLE' : 'DATABASE_UNAVAILABLE';
    const message = isQueue ? 'Queue service unavailable' : 'Database service unavailable';

    logger.warn({ code, err: err.message, requestId }, 'Infrastructure dependency failure detected');
    return res.status(503).json({
      error: {
        code,
        message,
        requestId
      }
    });
  }

  // Unexpected internal server error
  logger.error(
    {
      err: {
        message: err.message,
        stack: err.stack
      },
      requestId,
      path: req.originalUrl,
      method: req.method
    },
    'Unhandled server error'
  );

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal error occurred',
      requestId
    }
  });
}
