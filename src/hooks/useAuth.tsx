import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '../lib/api';

type AuthContextValue = {
  isAuthenticated: boolean | null;
  user: any;
  isGuest: boolean;
  setUser: (user: any) => void;
  setIsAuthenticated: (auth: boolean | null) => void;
  checkAuth: () => Promise<void>;
  handleLogin: (userData?: any) => void;
  handleGuestLogin: () => void;
  handleLogout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isGuest, setIsGuest] = useState<boolean>(false);
  const retryRef = useRef(0);

  const checkAuth = useCallback(async () => {
    if (sessionStorage.getItem('auth_mode') === 'guest') {
      setIsAuthenticated(true);
      setIsGuest(true);
      setUser({ id: 'guest', email: 'guest@local', name: 'Guest User' });
      return;
    }

    try {
      const res = await apiFetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          setIsAuthenticated(true);
          setIsGuest(false);
          setUser(data.user);
        } else {
          setIsAuthenticated(false);
          setIsGuest(false);
          setUser(null);
        }
      } else {
        setIsAuthenticated(false);
        setIsGuest(false);
        setUser(null);
      }
      retryRef.current = 0;
    } catch (err) {
      if (retryRef.current < 3) {
        retryRef.current++;
        setTimeout(() => checkAuth(), 1500 * retryRef.current);
      }
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      setIsGuest(false);
      setUser(null);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  const handleLogin = useCallback((userData?: any) => {
    setIsAuthenticated(true);
    setIsGuest(false);
    sessionStorage.removeItem('auth_mode');
    if (userData) setUser(userData);
  }, []);

  const handleGuestLogin = useCallback(() => {
    setIsAuthenticated(true);
    setIsGuest(true);
    setUser({ id: 'guest', email: 'guest@local', name: 'Guest User' });
    sessionStorage.setItem('auth_mode', 'guest');
  }, []);

  const handleLogout = useCallback(async () => {
    if (isGuest) {
      setIsAuthenticated(false);
      setIsGuest(false);
      setUser(null);
      sessionStorage.removeItem('auth_mode');
      return;
    }

    try {
      const res = await apiFetch('/api/logout', { method: 'POST' });
      if (res.ok) {
        setIsAuthenticated(false);
        setIsGuest(false);
        setUser(null);
      }
    } catch (err) {
      console.error('Logout error:', err);
    }
  }, [isGuest]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        isGuest,
        setUser,
        setIsAuthenticated,
        checkAuth,
        handleLogin,
        handleGuestLogin,
        handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
