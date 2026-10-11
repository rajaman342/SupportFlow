import pino from 'pino';
import { getConfig } from './config.js';

export function createLogger(customOptions = {}) {
  let logLevel = 'info';
  try {
    const cfg = getConfig();
    logLevel = cfg.LOG_LEVEL;
  } catch {
    logLevel = process.env.LOG_LEVEL || 'info';
  }

  return pino({
    level: customOptions.level || logLevel,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'password',
        'currentPassword',
        'newPassword',
        'token',
        'refreshToken',
        'secret',
        'apiKey',
        'prompt',
        'promptText',
        'messageBody',
        'body.password',
        'body.currentPassword',
        'body.newPassword',
        'body.token',
        '*.password',
        '*.secret',
        '*.apiKey',
        '*.token'
      ],
      censor: '[REDACTED]'
    },
    ...customOptions
  });
}

export const logger = createLogger();
