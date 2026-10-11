import crypto from 'node:crypto';

const REQUEST_ID_MAX_LENGTH = 64;
const VALID_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

export function requestIdMiddleware(req, res, next) {
  let requestId = req.headers['x-request-id'];

  if (
    !requestId ||
    typeof requestId !== 'string' ||
    requestId.length > REQUEST_ID_MAX_LENGTH ||
    !VALID_REQUEST_ID_REGEX.test(requestId)
  ) {
    requestId = crypto.randomUUID();
  }

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
