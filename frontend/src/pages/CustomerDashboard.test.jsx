import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import CustomerDashboard from './CustomerDashboard.jsx';
import { ticketsApi } from '../services/api.js';

describe('CustomerDashboard Page Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders tickets list with status and priority badges', async () => {
    vi.spyOn(ticketsApi, 'list').mockResolvedValueOnce({
      data: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          subject: 'Cannot login to account',
          status: 'open',
          priority: 'high',
          createdAt: new Date().toISOString()
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          subject: 'Inquiry regarding billing invoice',
          status: 'resolved',
          priority: 'medium',
          createdAt: new Date().toISOString()
        }
      ],
      meta: { page: 1, limit: 20, total: 2, totalPages: 1 }
    });

    render(
      <MemoryRouter>
        <CustomerDashboard />
      </MemoryRouter>
    );

    expect(screen.getByText(/Loading your support tickets.../i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Cannot login to account/i)).toBeInTheDocument();
      expect(screen.getByText(/Inquiry regarding billing invoice/i)).toBeInTheDocument();
      expect(screen.getAllByText('Open').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Resolved').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('High')).toBeInTheDocument();
    });
  });

  it('renders empty state when customer has no tickets', async () => {
    vi.spyOn(ticketsApi, 'list').mockResolvedValueOnce({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 1 }
    });

    render(
      <MemoryRouter>
        <CustomerDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/No support tickets yet/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Open a Ticket/i })).toBeInTheDocument();
    });
  });

  it('refetches tickets when status filter tab is clicked', async () => {
    const listSpy = vi.spyOn(ticketsApi, 'list').mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 1 }
    });

    render(
      <MemoryRouter>
        <CustomerDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
    });

    fireEvent.click(screen.getByRole('button', { name: 'Resolved' }));

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'resolved', page: 1 })
      );
    });
  });
});
