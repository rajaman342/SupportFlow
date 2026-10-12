import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TicketDetail from './TicketDetail.jsx';
import { ticketsApi } from '../services/api.js';
import * as AuthContextModule from '../context/AuthContext.jsx';

describe('TicketDetail Page Component', () => {
  const mockTicket = {
    id: '33333333-3333-3333-3333-333333333333',
    subject: 'Cannot access billing portal',
    status: 'open',
    priority: 'high',
    createdAt: new Date().toISOString(),
    customer: { id: 'cust-1', fullName: 'Alice Customer' },
    assignedAgent: null
  };

  const mockMessages = [
    {
      id: 'm-1',
      senderId: 'cust-1',
      senderRole: 'customer',
      senderName: 'Alice Customer',
      body: 'I am getting 403 when trying to view invoices.',
      createdAt: new Date().toISOString()
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders ticket details and message history', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'cust-1', role: 'customer' },
      isCustomer: true,
      isStaff: false,
      isAdmin: false
    });

    vi.spyOn(ticketsApi, 'get').mockResolvedValueOnce(mockTicket);
    vi.spyOn(ticketsApi, 'getMessages').mockResolvedValueOnce({
      data: mockMessages
    });

    render(
      <MemoryRouter initialEntries={[`/tickets/${mockTicket.id}`]}>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Cannot access billing portal')).toBeInTheDocument();
      expect(screen.getByText('I am getting 403 when trying to view invoices.')).toBeInTheDocument();
      expect(screen.getByText('Alice Customer')).toBeInTheDocument();
    });
  });

  it('allows posting a new reply message', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'cust-1', role: 'customer' },
      isCustomer: true,
      isStaff: false,
      isAdmin: false
    });

    vi.spyOn(ticketsApi, 'get').mockResolvedValueOnce(mockTicket);
    vi.spyOn(ticketsApi, 'getMessages').mockResolvedValueOnce({
      data: mockMessages
    });

    const createMessageSpy = vi.spyOn(ticketsApi, 'createMessage').mockResolvedValueOnce({
      id: 'm-2',
      senderId: 'cust-1',
      senderRole: 'customer',
      senderName: 'Alice Customer',
      body: 'Here is another piece of information.',
      createdAt: new Date().toISOString()
    });

    render(
      <MemoryRouter initialEntries={[`/tickets/${mockTicket.id}`]}>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Cannot access billing portal')).toBeInTheDocument();
    });

    const replyInput = screen.getByPlaceholderText(/Type your response here.../i);
    fireEvent.change(replyInput, { target: { value: 'Here is another piece of information.' } });

    fireEvent.click(screen.getByRole('button', { name: /Send Reply/i }));

    await waitFor(() => {
      expect(createMessageSpy).toHaveBeenCalledWith(mockTicket.id, {
        body: 'Here is another piece of information.'
      });
      expect(screen.getByText('Here is another piece of information.')).toBeInTheDocument();
    });
  });

  it('shows staff controls and allows status transition for agents', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'agent-1', role: 'agent' },
      isCustomer: false,
      isStaff: true,
      isAdmin: false
    });

    vi.spyOn(ticketsApi, 'get').mockResolvedValueOnce(mockTicket);
    vi.spyOn(ticketsApi, 'getMessages').mockResolvedValueOnce({
      data: mockMessages
    });

    const statusSpy = vi.spyOn(ticketsApi, 'updateStatus').mockResolvedValueOnce({
      ...mockTicket,
      status: 'in_progress'
    });

    render(
      <MemoryRouter initialEntries={[`/tickets/${mockTicket.id}`]}>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Start Working \(In Progress\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Assign to Myself/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Start Working \(In Progress\)/i));

    await waitFor(() => {
      expect(statusSpy).toHaveBeenCalledWith(mockTicket.id, 'in_progress');
      expect(screen.getByText(/Ticket status updated to in progress./i)).toBeInTheDocument();
    });
  });
});
