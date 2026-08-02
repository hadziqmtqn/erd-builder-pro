import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch, clearAuthToken, isInstalledApp, setAuthToken } from '../lib/api';

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
          // Store token from auto-login (desktop mode) or login response
          if (data.token) setAuthToken(data.token);
          setIsAuthenticated(true);
          setIsGuest(false);
          setUser(data.user);
          retryRef.current = 0;
          return;
        } else {
          setIsAuthenticated(false);
          setIsGuest(false);
          setUser(null);
          clearAuthToken();
        }
      } else if (res.status === 503) {
        // Database still initializing (desktop mode) — retry if transient.
        // If server signals db_error:true, the failure is permanent (ABI mismatch).
        const body = await res.json().catch(() => ({}));
        if (body.db_error) {
          console.error('[checkAuth] Permanent database error:', body.message);
          setIsAuthenticated(false);
          setIsGuest(false);
          setUser(null);
          clearAuthToken();
          return;
        }
        if (isInstalledApp() && retryRef.current < 30) {
          retryRef.current++;
          const delay = Math.min(1500 * Math.pow(1.3, retryRef.current - 1), 5000);
          setTimeout(() => checkAuth(), delay);
          return;
        }
        // After 30 retries (~60s), fall through to error state
        setIsAuthenticated(false);
        setIsGuest(false);
        setUser(null);
        clearAuthToken();
      } else {
        setIsAuthenticated(false);
        setIsGuest(false);
        setUser(null);
        clearAuthToken();
      }
      retryRef.current = 0;
    } catch (err) {
      const isLocalApp = isInstalledApp();
      // Installed local apps start the Node.js server asynchronously — retry
      // indefinitely with exponential backoff until it becomes reachable.
      // The server-side GET /api/me will auto-login once available.
      const maxRetries = isLocalApp ? Infinity : 3;
      if (retryRef.current < maxRetries) {
        retryRef.current++;
        const delay = isLocalApp
          ? Math.min(1500 * Math.pow(1.5, retryRef.current - 1), 10000)
          : 1500 * retryRef.current;
        setTimeout(() => checkAuth(), delay);
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
    clearAuthToken();
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
        clearAuthToken();
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
