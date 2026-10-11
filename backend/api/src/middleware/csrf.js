import { getConfig, ForbiddenError } from '@supportflow/shared';

export function csrfProtectionMiddleware(req, _res, next) {
  const customHeader = req.headers['x-requested-with'];
  if (customHeader !== 'supportflow') {
    return next(
      new ForbiddenError('Missing or invalid custom CSRF header', 'CSRF_REJECTED')
    );
  }

  const origin = req.headers.origin;
  if (origin) {
    const config = getConfig();
    const allowedOrigins = config.CORS_ORIGINS.split(',').map((o) => o.trim());

    if (!allowedOrigins.includes(origin)) {
      return next(
        new ForbiddenError('Disallowed request Origin', 'CSRF_REJECTED')
      );
    }
  }

  next();
}
