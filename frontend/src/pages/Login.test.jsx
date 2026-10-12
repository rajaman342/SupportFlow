import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login.jsx';
import * as AuthContextModule from '../context/AuthContext.jsx';

describe('Login Page Component', () => {
  let mockLogin;

  beforeEach(() => {
    mockLogin = vi.fn();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      login: mockLogin,
      user: null,
      loading: false,
      isAuthenticated: false
    });
  });

  it('renders all required form controls and labels', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /SupportFlow/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
  });

  it('fills demo credentials when quick demo buttons are clicked', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    const adminButton = screen.getByRole('button', { name: /Admin/i });
    fireEvent.click(adminButton);

    const emailInput = screen.getByLabelText(/Email Address/i);
    const passwordInput = screen.getByLabelText(/Password/i);

    expect(emailInput.value).toBe('admin@demo.test');
    expect(passwordInput.value).toBe('Password123!');
  });

  it('submits credentials and calls auth login', async () => {
    mockLogin.mockResolvedValueOnce({
      id: 'cust-1',
      email: 'cust@demo.test',
      role: 'customer'
    });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'cust@demo.test' }
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'Password123!' }
    });

    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('cust@demo.test', 'Password123!');
    });
  });

  it('displays error alert on login failure', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid email or password'));

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'bad@demo.test' }
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'WrongPass123!' }
    });

    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => {
      expect(screen.getByText(/Invalid email or password/i)).toBeInTheDocument();
    });
  });
});
