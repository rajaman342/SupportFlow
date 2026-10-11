import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import App from './App.jsx';

describe('Frontend App Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the SupportFlow heading and status cards', async () => {
    // Mock fetch responses for /health and /ready
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/health') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { status: 'ok' } })
        });
      }
      if (url === '/ready') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                status: 'ready',
                dependencies: { database: true, redis: true }
              }
            })
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });

    await act(async () => {
      render(<App />);
    });

    expect(screen.getByText(/SupportFlow/i)).toBeInTheDocument();
    expect(screen.getByText(/API Liveness/i)).toBeInTheDocument();
    expect(screen.getByText(/Readiness/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Healthy \(200 OK\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Ready \(200 OK\)/i)).toBeInTheDocument();
    });
  });
});
