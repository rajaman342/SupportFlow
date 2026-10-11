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
