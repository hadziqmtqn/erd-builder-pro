import { useState, useCallback, useEffect } from 'react';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isGuest, setIsGuest] = useState<boolean>(false);

  const checkAuth = useCallback(async () => {
    // If we're already in guest mode in this session, don't check API
    if (sessionStorage.getItem('auth_mode') === 'guest') {
      setIsAuthenticated(true);
      setIsGuest(true);
      setUser({ id: 'guest', email: 'guest@local', name: 'Guest User' });
      return;
    }

    try {
      const res = await fetch('/api/me');
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
    } catch (err) {
      setIsAuthenticated(false);
      setIsGuest(false);
      setUser(null);
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
      const res = await fetch('/api/logout', { method: 'POST' });
      if (res.ok) {
        setIsAuthenticated(false);
        setIsGuest(false);
        setUser(null);
      }
    } catch (err) {
      console.error('Logout error:', err);
    }
  }, [isGuest]);

  return {
    isAuthenticated,
    isGuest,
    user,
    setIsAuthenticated,
    checkAuth,
    handleLogin,
    handleGuestLogin,
    handleLogout
  };
}

