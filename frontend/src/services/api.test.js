import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setAccessToken,
  getAccessToken,
  refreshAccessToken,
  onAuthFailure,
  ticketsApi
} from './api.js';

describe('Frontend API Client & In-Memory Token Management', () => {
  beforeEach(() => {
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setAccessToken(null);
  });

  it('stores access tokens strictly in memory (never localStorage or sessionStorage)', () => {
    setAccessToken('test-access-token-123');
    expect(getAccessToken()).toBe('test-access-token-123');

    // Confirm that nothing is written to web storage
    expect(window.localStorage.getItem('token')).toBeNull();
    expect(window.localStorage.getItem('sf_token')).toBeNull();
    expect(window.sessionStorage.getItem('token')).toBeNull();
  });

  it('attaches Bearer token, X-Requested-With header, and credentials: include', async () => {
    setAccessToken('valid-bearer-token');

    let capturedHeaders = null;
    let capturedCredentials = null;

    global.fetch = vi.fn().mockImplementation((url, options) => {
      capturedHeaders = options.headers;
      capturedCredentials = options.credentials;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: { id: 'ticket-1' } })
      });
    });

    const res = await ticketsApi.get('ticket-1');

    expect(res).toEqual({ id: 'ticket-1' });
    expect(capturedHeaders['Authorization']).toBe('Bearer valid-bearer-token');
    expect(capturedHeaders['X-Requested-With']).toBe('supportflow');
    expect(capturedCredentials).toBe('include');
  });

  it('performs single-flight refresh on 401 and retries original request', async () => {
    setAccessToken('expired-token');

    let refreshCallCount = 0;
    let mainCallCount = 0;

    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/auth/refresh')) {
        refreshCallCount++;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: { accessToken: 'fresh-new-token' } })
        });
      }

      if (url.includes('/tickets/t-1')) {
        mainCallCount++;
        if (options.headers['Authorization'] === 'Bearer expired-token') {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ error: { code: 'UNAUTHENTICATED' } })
          });
        }
        if (options.headers['Authorization'] === 'Bearer fresh-new-token') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: { id: 't-1', subject: 'Refreshed Ticket' } })
          });
        }
      }

      return Promise.reject(new Error(`Unhandled request to ${url}`));
    });

    const result = await ticketsApi.get('t-1');

    expect(result).toEqual({ id: 't-1', subject: 'Refreshed Ticket' });
    expect(refreshCallCount).toBe(1);
    expect(mainCallCount).toBe(2); // Initial failed call + retry
    expect(getAccessToken()).toBe('fresh-new-token');
  });

  it('notifies auth failure listeners when refresh token fails', async () => {
    let authFailureFired = false;
    const unsub = onAuthFailure(() => {
      authFailureFired = true;
    });

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: { code: 'REFRESH_INVALID' } })
        });
      }
      return Promise.reject(new Error('Unknown'));
    });

    const refreshed = await refreshAccessToken();

    expect(refreshed).toBeNull();
    expect(authFailureFired).toBe(true);
    expect(getAccessToken()).toBeNull();

    unsub();
  });
});
