import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute.jsx';
import * as AuthContextModule from '../context/AuthContext.jsx';

describe('ProtectedRoute Component', () => {
  it('renders loading spinner while authentication state is loading', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      loading: true,
      isAuthenticated: false
    });

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText(/Verifying session.../i)).toBeInTheDocument();
    expect(screen.queryByText(/Protected Content/i)).not.toBeInTheDocument();
  });

  it('redirects to /login when user is unauthenticated', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      loading: false,
      isAuthenticated: false
    });

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/Login Page/i)).toBeInTheDocument();
    expect(screen.queryByText(/Protected Content/i)).not.toBeInTheDocument();
  });

  it('renders 403 Forbidden screen when user role is not allowed', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'user-1', email: 'cust@test.com', role: 'customer' },
      loading: false,
      isAuthenticated: true
    });

    render(
      <MemoryRouter initialEntries={['/agent-only']}>
        <ProtectedRoute allowedRoles={['agent', 'admin']}>
          <div>Agent Workspace</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText(/403 — Access Denied/i)).toBeInTheDocument();
    expect(screen.getByText(/does not have permission to view this section/i)).toBeInTheDocument();
    expect(screen.getByText('customer')).toBeInTheDocument();
    expect(screen.queryByText(/Agent Workspace/i)).not.toBeInTheDocument();
  });

  it('renders children when user role matches allowedRoles', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'admin-1', email: 'admin@test.com', role: 'admin' },
      loading: false,
      isAuthenticated: true
    });

    render(
      <MemoryRouter initialEntries={['/admin-only']}>
        <ProtectedRoute allowedRoles={['admin']}>
          <div>Admin Panel</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText(/Admin Panel/i)).toBeInTheDocument();
  });
});
