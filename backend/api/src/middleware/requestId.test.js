import { describe, it, expect, vi } from 'vitest';
import { requestIdMiddleware } from './requestId.js';

describe('requestIdMiddleware', () => {
  it('generates a new UUID when X-Request-Id header is absent', () => {
    const req = { headers: {} };
    const res = {
      setHeader: vi.fn()
    };
    const next = vi.fn();

    requestIdMiddleware(req, res, next);

    expect(req.id).toBeDefined();
    expect(req.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.id);
    expect(next).toHaveBeenCalled();
  });

  it('preserves a valid incoming X-Request-Id', () => {
    const req = { headers: { 'x-request-id': 'client-trace-12345' } };
    const res = {
      setHeader: vi.fn()
    };
    const next = vi.fn();

    requestIdMiddleware(req, res, next);

    expect(req.id).toBe('client-trace-12345');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'client-trace-12345');
    expect(next).toHaveBeenCalled();
  });

  it('replaces an invalid or oversized incoming X-Request-Id with a UUID', () => {
    const oversized = 'a'.repeat(70);
    const req = { headers: { 'x-request-id': oversized } };
    const res = {
      setHeader: vi.fn()
    };
    const next = vi.fn();

    requestIdMiddleware(req, res, next);

    expect(req.id).not.toBe(oversized);
    expect(req.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(next).toHaveBeenCalled();
  });
});
