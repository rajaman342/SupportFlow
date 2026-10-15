import { ForbiddenError } from '@supportflow/shared';

export function requireRole(...allowedRoles) {
  const roles = allowedRoles.flat();
  return (req, _res, next) => {
    if (!req.user) {
      return next(new ForbiddenError('Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Action requires one of the following roles: [${roles.join(', ')}]`,
          'FORBIDDEN'
        )
      );
    }

    next();
  };
}
