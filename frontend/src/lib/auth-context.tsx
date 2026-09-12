'use client';

import type { AuthTokenResponse, SafeUser } from '@/lib/shared-types';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiGet, apiPost, setAccessToken, setUnauthorizedHandler } from './api-client';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  user: SafeUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-fetches the current user (e.g. after verify-email or a name change) without a full page reload. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Owns the authenticated user + access token lifecycle for the whole app.
 * On mount, silently attempts a refresh (the access token is memory-only and
 * doesn't survive a page reload — see api-client.ts — but the httpOnly
 * refresh cookie does), so a reload doesn't force a re-login as long as the
 * refresh cookie is still valid.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);

    let cancelled = false;
    (async () => {
      try {
        const res = await apiPost<AuthTokenResponse>('/auth/refresh');
        if (cancelled) return;
        setAccessToken(res.accessToken);
        setUser(res.user);
        setStatus('authenticated');
      } catch {
        if (!cancelled) setStatus('unauthenticated');
      }
    })();

    return () => {
      cancelled = true;
      setUnauthorizedHandler(null);
    };
  }, [clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiPost<AuthTokenResponse>('/auth/login', { email, password });
    setAccessToken(res.accessToken);
    setUser(res.user);
    setStatus('authenticated');
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const res = await apiPost<AuthTokenResponse>('/auth/register', { email, password, name });
    setAccessToken(res.accessToken);
    setUser(res.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiPost<void>('/auth/logout');
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const fresh = await apiGet<SafeUser>('/users/me');
    setUser(fresh);
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, register, logout, refreshUser }}>
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
