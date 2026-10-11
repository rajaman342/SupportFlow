import { ValidationError } from '@supportflow/shared';

export function validateRequest({ body = null, query = null, params = null }) {
  return (req, _res, next) => {
    try {
      if (body) {
        req.body = body.parse(req.body);
      }
      if (query) {
        req.query = query.parse(req.query);
      }
      if (params) {
        req.params = params.parse(req.params);
      }
      next();
    } catch (err) {
      if (err.errors) {
        const details = err.errors.map((e) => ({
          field: e.path.join('.'),
          issue: e.message
        }));
        return next(new ValidationError('Request validation failed', details));
      }
      next(err);
    }
  };
}
