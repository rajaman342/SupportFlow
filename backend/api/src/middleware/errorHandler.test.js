import { describe, it, expect, vi } from 'vitest';
import { errorHandlerMiddleware } from './errorHandler.js';
import { ValidationError } from '@supportflow/shared';

describe('errorHandlerMiddleware', () => {
  it('formats AppError into the standard envelope', () => {
    const error = new ValidationError('Invalid request body', [{ field: 'email', issue: 'Invalid format' }]);
    const req = { id: 'req-test-123', originalUrl: '/api/v1/test', method: 'POST' };
    const res = {
      getHeader: vi.fn().mockReturnValue('req-test-123'),
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    errorHandlerMiddleware(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: [{ field: 'email', issue: 'Invalid format' }],
        requestId: 'req-test-123'
      }
    });
  });

  it('formats unexpected runtime Error into INTERNAL_ERROR without leaking stack trace', () => {
    const error = new Error('Database password failed at /secrets/db.txt');
    const req = { id: 'req-unexpected-999', originalUrl: '/api/v1/test', method: 'GET' };
    const res = {
      getHeader: vi.fn().mockReturnValue('req-unexpected-999'),
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    errorHandlerMiddleware(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected internal error occurred',
        requestId: 'req-unexpected-999'
      }
    });
  });
});
