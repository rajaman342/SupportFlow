import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import AdminUsers from './AdminUsers.jsx';
import { usersApi } from '../services/api.js';
import * as AuthContextModule from '../context/AuthContext.jsx';

describe('AdminUsers Page Component', () => {
  const mockUsers = [
    {
      id: 'admin-1',
      fullName: 'Chief Administrator',
      email: 'admin@demo.test',
      role: 'admin',
      isActive: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'agent-1',
      fullName: 'Agent Bob',
      email: 'bob@demo.test',
      role: 'agent',
      isActive: true,
      createdAt: new Date().toISOString()
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'admin-1', email: 'admin@demo.test', role: 'admin' },
      isAdmin: true,
      isStaff: true
    });
  });

  it('renders list of organization users with roles and status', async () => {
    vi.spyOn(usersApi, 'list').mockResolvedValueOnce({
      data: mockUsers,
      meta: { page: 1, limit: 20, total: 2, totalPages: 1 }
    });

    render(
      <MemoryRouter>
        <AdminUsers />
      </MemoryRouter>
    );

    expect(screen.getByText(/Loading organization users.../i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Chief Administrator')).toBeInTheDocument();
      expect(screen.getByText('Agent Bob')).toBeInTheDocument();
      expect(screen.getByText('admin@demo.test')).toBeInTheDocument();
      expect(screen.getByText('bob@demo.test')).toBeInTheDocument();
      expect(screen.getByText('You')).toBeInTheDocument();
    });
  });

  it('updates user role when role select is changed', async () => {
    vi.spyOn(usersApi, 'list').mockResolvedValueOnce({
      data: mockUsers,
      meta: { page: 1, limit: 20, total: 2, totalPages: 1 }
    });

    const updateRoleSpy = vi.spyOn(usersApi, 'updateRole').mockResolvedValueOnce({
      id: 'agent-1',
      role: 'admin'
    });

    render(
      <MemoryRouter>
        <AdminUsers />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Agent Bob')).toBeInTheDocument();
    });

    const roleSelect = screen.getByLabelText(/Change role for Agent Bob/i);
    fireEvent.change(roleSelect, { target: { value: 'admin' } });

    await waitFor(() => {
      expect(updateRoleSpy).toHaveBeenCalledWith('agent-1', 'admin');
      expect(screen.getByText(/User role updated successfully./i)).toBeInTheDocument();
    });
  });

  it('displays error banner if attempting to deactivate the last admin', async () => {
    vi.spyOn(usersApi, 'list').mockResolvedValueOnce({
      data: mockUsers,
      meta: { page: 1, limit: 20, total: 2, totalPages: 1 }
    });

    vi.spyOn(usersApi, 'updateActive').mockRejectedValueOnce(
      new Error('Cannot deactivate the last active administrator')
    );

    render(
      <MemoryRouter>
        <AdminUsers />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Chief Administrator')).toBeInTheDocument();
    });

    const deactivateButtons = screen.getAllByRole('button', { name: /Deactivate/i });
    fireEvent.click(deactivateButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Cannot deactivate the last active administrator/i)).toBeInTheDocument();
    });
  });
});
