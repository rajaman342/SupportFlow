import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import App from './App.jsx';

describe('Frontend App Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the login page when unauthenticated', async () => {
    // Mock fetch for /api/v1/auth/refresh returning 401 unauthenticated
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/v1/auth/refresh')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: { code: 'REFRESH_INVALID', message: 'No refresh token' } })
        });
      }
      if (url.includes('/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: { status: 'ok' } })
        });
      }
      if (url.includes('/ready')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: { status: 'ready', dependencies: { database: true, redis: true } } })
        });
      }
      return Promise.reject(new Error(`Unhandled request to ${url}`));
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /SupportFlow/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
    });
  });

  it('displays quick demo account fill options', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/v1/auth/refresh')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: { code: 'REFRESH_INVALID' } })
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: {} })
      });
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Admin/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Agent 1/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Customer 1/i })).toBeInTheDocument();
    });
  });
});
