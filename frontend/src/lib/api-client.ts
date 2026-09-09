import type { ApiErrorBody } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/**
 * The access token lives in memory only (module-level variable), never in
 * localStorage/sessionStorage — an XSS payload that can run JS can always call
 * fetch with `credentials: 'include'` too, but keeping the token out of any
 * storage API at least avoids it being trivially exfiltrated at rest or via
 * non-JS vectors. On page load it's re-obtained via the httpOnly refresh
 * cookie (see AuthProvider's initial silent refresh).
 */
let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** AuthProvider registers this to react (clear user, redirect to /login) when a session can't be salvaged. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody,
  ) {
    super(Array.isArray(body.message) ? body.message.join(', ') : body.message);
    this.name = 'ApiError';
  }
}

async function rawRequest(path: string, options: RequestInit, token: string | null) {
  const isFormData = options.body instanceof FormData;
  return fetch(`${API_BASE}${path}`, {
    ...options,
    // Always sent: this is what carries the httpOnly refresh cookie across
    // the cross-origin (3000 -> 3001) request in local dev.
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

let refreshPromise: Promise<string | null> | null = null;

/** De-duplicates concurrent refreshes: N requests failing with 401 at once trigger exactly one refresh call. */
async function refreshAccessToken(): Promise<string | null> {
  refreshPromise ??= (async () => {
    try {
      const res = await rawRequest('/auth/refresh', { method: 'POST' }, null);
      if (!res.ok) return null;
      const data = (await res.json()) as { accessToken: string };
      setAccessToken(data.accessToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

const AUTH_ENDPOINTS_NEVER_RETRIED = new Set(['/auth/login', '/auth/register', '/auth/refresh']);

/**
 * The single entry point every API call goes through. On a 401 from anything
 * other than the auth endpoints themselves, it attempts exactly one silent
 * refresh-and-retry before giving up — this is what makes a page reload (which
 * clears the in-memory access token) transparent to the user as long as their
 * refresh cookie is still valid.
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await rawRequest(path, options, getAccessToken());
  let finalRes = res;

  if (res.status === 401 && !AUTH_ENDPOINTS_NEVER_RETRIED.has(path)) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      finalRes = await rawRequest(path, options, newToken);
    } else {
      onUnauthorized?.();
    }
  }

  if (!finalRes.ok) {
    if (finalRes.status === 401) onUnauthorized?.();
    let body: ApiErrorBody;
    try {
      body = (await finalRes.json()) as ApiErrorBody;
    } catch {
      body = {
        statusCode: finalRes.status,
        message: finalRes.statusText,
        error: 'Error',
        path,
        timestamp: new Date().toISOString(),
      };
    }
    throw new ApiError(finalRes.status, body);
  }

  if (finalRes.status === 204) {
    return undefined as T;
  }
  return (await finalRes.json()) as T;
}

export const apiGet = <T>(path: string) => apiFetch<T>(path);

export const apiPost = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined });

export const apiPatch = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined });

export const apiDelete = <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' });
