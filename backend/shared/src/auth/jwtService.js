import crypto from 'node:crypto';
import { getConfig } from '../config.js';
import { UnauthenticatedError } from '../errors.js';

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64url');
}

function base64UrlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf-8');
}

export function signAccessToken(userId) {
  const config = getConfig();
  const ttlSeconds = (config.ACCESS_TOKEN_TTL_MINUTES || 15) * 60;
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const payload = {
    sub: userId,
    iat: now,
    exp: now + ttlSeconds
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', config.JWT_ACCESS_SECRET)
    .update(signatureInput)
    .digest('base64url');

  return `${signatureInput}.${signature}`;
}

export function verifyAccessToken(token) {
  const config = getConfig();

  if (!token || typeof token !== 'string') {
    throw new UnauthenticatedError('Missing access token');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new UnauthenticatedError('Malformed access token');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = crypto
    .createHmac('sha256', config.JWT_ACCESS_SECRET)
    .update(signatureInput)
    .digest('base64url');

  // Constant-time signature comparison
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    throw new UnauthenticatedError('Invalid token signature');
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    throw new UnauthenticatedError('Invalid token payload');
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    throw new UnauthenticatedError('Access token has expired');
  }

  return payload;
}
