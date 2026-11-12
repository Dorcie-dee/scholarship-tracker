'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, clearAccessToken, setAccessToken } from './api-client';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  isVerified: boolean;
  role: 'user' | 'admin';
  createdAt: string;
}

interface AuthTokenResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  user: AuthUser;
}

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (name: string | undefined, email: string, password: string) => Promise<AuthUser>;
  setupAdmin: (name: string | undefined, email: string, password: string, setupSecret: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /** Re-reads the current user onto context, e.g. after email verification. */
  setUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  // Silent bootstrap: the refresh cookie (if any) is httpOnly and same-site,
  // so a plain POST here is enough to pick up a prior session on page load
  // without ever showing the user a login screen they don't need.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<AuthTokenResponse>('/auth/refresh', {
          method: 'POST',
          skipAuthRetry: true,
        });
        if (cancelled) return;
        setAccessToken(data.accessToken, data.accessTokenExpiresAt);
        setUserState(data.user);
        setStatus('authenticated');
      } catch {
        if (cancelled) return;
        clearAccessToken();
        setStatus('unauthenticated');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<AuthTokenResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuthRetry: true,
    });
    setAccessToken(data.accessToken, data.accessTokenExpiresAt);
    setUserState(data.user);
    setStatus('authenticated');
    return data.user;
  }, []);

  const register = useCallback(async (name: string | undefined, email: string, password: string) => {
    const data = await apiFetch<AuthTokenResponse>('/auth/register', {
      method: 'POST',
      body: name ? { name, email, password } : { email, password },
      skipAuthRetry: true,
    });
    setAccessToken(data.accessToken, data.accessTokenExpiresAt);
    setUserState(data.user);
    setStatus('authenticated');
    return data.user;
  }, []);

  const setupAdmin = useCallback(
    async (name: string | undefined, email: string, password: string, setupSecret: string) => {
      const data = await apiFetch<AuthTokenResponse>('/auth/setup-admin', {
        method: 'POST',
        body: name ? { name, email, password, setupSecret } : { email, password, setupSecret },
        skipAuthRetry: true,
      });
      setAccessToken(data.accessToken, data.accessTokenExpiresAt);
      setUserState(data.user);
      setStatus('authenticated');
      return data.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST', skipAuthRetry: true });
    } finally {
      clearAccessToken();
      setUserState(null);
      setStatus('unauthenticated');
    }
  }, []);

  const setUser = useCallback((next: AuthUser) => setUserState(next), []);

  const value = useMemo(
    () => ({ user, status, login, register, setupAdmin, logout, setUser }),
    [user, status, login, register, setupAdmin, logout, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
