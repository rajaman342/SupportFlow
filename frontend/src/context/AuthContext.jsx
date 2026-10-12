import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, onAuthFailure } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Attempt to restore session on page load using HttpOnly refresh cookie
  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        const token = await authApi.refresh();
        if (token && mounted) {
          const profile = await authApi.me();
          if (mounted) {
            setUser(profile);
          }
        }
      } catch {
        if (mounted) {
          setUser(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    const unsubscribe = onAuthFailure(() => {
      if (mounted) {
        setUser(null);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authApi.login({ email, password });
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (email, password, fullName) => {
    const data = await authApi.register({ email, password, fullName });
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await authApi.me();
      setUser(profile);
      return profile;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    isCustomer: user?.role === 'customer',
    isAgent: user?.role === 'agent',
    isAdmin: user?.role === 'admin',
    isStaff: user?.role === 'agent' || user?.role === 'admin',
    login,
    register,
    logout,
    refreshUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
