/**
 * Fetch wrapper for the app's own `/api/*` route handlers (same origin, so
 * the refresh cookie rides along automatically — no CORS/credentials config
 * needed). The access token is kept in memory only (never localStorage) to
 * limit what an XSS payload could exfiltrate; it's re-acquired via a silent
 * `/api/auth/refresh` call (using the httpOnly cookie) on load and on any
 * 401, so a page refresh never forces a real re-login.
 */

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly errorName: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  statusCode: number;
  message: string;
  error: string;
  requestId?: string;
}

let accessToken: string | null = null;
let accessTokenExpiresAt: number | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export function setAccessToken(token: string, expiresAtIso: string): void {
  accessToken = token;
  accessTokenExpiresAt = Date.parse(expiresAtIso);
}

export function clearAccessToken(): void {
  accessToken = null;
  accessTokenExpiresAt = null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function isAccessTokenFresh(): boolean {
  return accessToken !== null && accessTokenExpiresAt !== null && accessTokenExpiresAt - Date.now() > 5_000;
}

/** De-duplicates concurrent refresh attempts behind one in-flight promise. */
async function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' });
        if (!res.ok) {
          clearAccessToken();
          return false;
        }
        const data = (await res.json()) as { accessToken: string; accessTokenExpiresAt: string };
        setAccessToken(data.accessToken, data.accessTokenExpiresAt);
        return true;
      } catch {
        clearAccessToken();
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Skip the automatic 401 -> refresh -> retry dance (used by auth endpoints themselves). */
  skipAuthRetry?: boolean;
}

async function rawFetch(path: string, options: RequestOptions): Promise<Response> {
  const isFormData = options.body instanceof FormData;
  const headers = new Headers(options.headers);
  if (!isFormData && options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return fetch(`/api${path}`, {
    ...options,
    headers,
    body: isFormData ? (options.body as FormData) : options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res = await rawFetch(path, options);

  if (res.status === 401 && !options.skipAuthRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await rawFetch(path, options);
    }
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await res.json() : undefined;

  if (!res.ok) {
    const body = payload as ErrorBody | undefined;
    throw new ApiError(
      res.status,
      body?.message ?? 'Something went wrong. Please try again.',
      body?.error ?? 'Error',
      body?.requestId,
    );
  }

  return payload as T;
}

/** A friendly fallback for any error, typed or not — safe to show directly in UI copy. */
export function friendlyErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
