import { describe, it, expect, vi } from 'vitest';
import { CacheService } from '../../backend/shared/src/cache/cacheService.js';

describe('CacheService Unit Tests', () => {
  it('generates deterministic query hashes regardless of param order', () => {
    const cache = new CacheService({ config: { NODE_ENV: 'test' } });
    const hash1 = cache._hashQuery({ status: 'open', page: 2, limit: 10 });
    const hash2 = cache._hashQuery({ limit: 10, status: 'open', page: 2 });
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{16}$/);

    expect(cache._hashQuery({})).toBe('default');
    expect(cache._hashQuery(null)).toBe('default');
  });

  it('generates normalized text hashes for query embeddings', () => {
    const cache = new CacheService({ config: { NODE_ENV: 'test' } });
    const hash1 = cache._hashText('  How do I get a refund?  ');
    const hash2 = cache._hashText('how do i get a refund?');
    expect(hash1).toBe(hash2);
  });

  it('fails open when Redis operations throw errors', async () => {
    const mockFaultyRedis = {
      get: vi.fn().mockRejectedValue(new Error('Connection lost')),
      setex: vi.fn().mockRejectedValue(new Error('Connection lost')),
      incr: vi.fn().mockRejectedValue(new Error('Connection lost')),
      status: 'ready'
    };

    const cache = new CacheService({ redis: mockFaultyRedis, config: { NODE_ENV: 'test' } });

    // Should return fallback instead of throwing
    const result = await cache.getCustomerTicketList('org-1', 'user-1', { page: 1 });
    expect(result).toBeNull();

    // Invalidation should safely complete without throwing
    await expect(cache.invalidateTickets('org-1', 'user-1')).resolves.not.toThrow();
  });

  it('constructs properly isolated customer vs staff cache keys', async () => {
    const store = new Map();
    const mockRedis = {
      status: 'ready',
      get: vi.fn(async (key) => store.get(key) || null),
      setex: vi.fn(async (key, ttl, val) => store.set(key, val)),
      pipeline: vi.fn(() => ({
        incr: vi.fn((key) => {
          const current = parseInt(store.get(key) || '1', 10);
          store.set(key, String(current + 1));
        }),
        exec: vi.fn(async () => [])
      }))
    };

    const cache = new CacheService({ redis: mockRedis, config: { NODE_ENV: 'test' } });

    // Customer cache
    await cache.setCustomerTicketList('org-1', 'cust-1', { page: 1 }, [{ id: 't1' }], 30);
    const cachedCust = await cache.getCustomerTicketList('org-1', 'cust-1', { page: 1 });
    expect(cachedCust).toEqual([{ id: 't1' }]);

    // Customer 2 should NOT see Customer 1's cache
    const cust2Cached = await cache.getCustomerTicketList('org-1', 'cust-2', { page: 1 });
    expect(cust2Cached).toBeNull();

    // Staff cache is distinct from customer cache
    await cache.setStaffTicketList('org-1', 'agent', { page: 1 }, [{ id: 't1' }, { id: 't2' }], 30);
    const cachedStaff = await cache.getStaffTicketList('org-1', 'agent', { page: 1 });
    expect(cachedStaff).toEqual([{ id: 't1' }, { id: 't2' }]);
  });

  it('invalidates cache via version counters on write', async () => {
    const store = new Map();
    const mockRedis = {
      status: 'ready',
      get: vi.fn(async (key) => store.get(key) || null),
      setex: vi.fn(async (key, ttl, val) => store.set(key, val)),
      pipeline: vi.fn(() => ({
        incr: vi.fn((key) => {
          const current = parseInt(store.get(key) || '1', 10);
          store.set(key, String(current + 1));
        }),
        exec: vi.fn(async () => [])
      }))
    };

    const cache = new CacheService({ redis: mockRedis, config: { NODE_ENV: 'test' } });

    // Store data
    await cache.setCustomerTicketList('org-1', 'cust-1', { status: 'open' }, [{ id: 'ticket-1' }]);
    expect(await cache.getCustomerTicketList('org-1', 'cust-1', { status: 'open' })).toEqual([{ id: 'ticket-1' }]);

    // Invalidate
    await cache.invalidateTickets('org-1', 'cust-1');

    // New version counter makes previous entry unreachable
    const afterInvalidation = await cache.getCustomerTicketList('org-1', 'cust-1', { status: 'open' });
    expect(afterInvalidation).toBeNull();
  });
});
