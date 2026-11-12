import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  apiFetch,
  clearAccessToken,
  friendlyErrorMessage,
  getAccessToken,
  isAccessTokenFresh,
  setAccessToken,
} from '../api-client';

/**
 * This is the single highest-risk, highest-value untested piece of the
 * frontend (per the sustainability review that asked for this): the
 * 401 -> silent refresh -> retry-once dance every authenticated request
 * goes through, including the de-duplication that stops a page's several
 * concurrent requests from each firing their own refresh call. Mocks
 * `global.fetch` directly rather than a real server — this module's only
 * job is orchestrating fetch calls, not anything a real network is needed
 * to verify.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('api-client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    clearAccessToken();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearAccessToken();
  });

  describe('token state', () => {
    it('getAccessToken/isAccessTokenFresh reflect what setAccessToken was given', () => {
      expect(getAccessToken()).toBeNull();
      expect(isAccessTokenFresh()).toBe(false);

      setAccessToken('tok-123', new Date(Date.now() + 60_000).toISOString());
      expect(getAccessToken()).toBe('tok-123');
      expect(isAccessTokenFresh()).toBe(true);
    });

    it('a token expiring within 5 seconds is not considered fresh (avoids racing a request against expiry)', () => {
      setAccessToken('tok-123', new Date(Date.now() + 2_000).toISOString());
      expect(isAccessTokenFresh()).toBe(false);
    });

    it('clearAccessToken resets both the token and freshness', () => {
      setAccessToken('tok-123', new Date(Date.now() + 60_000).toISOString());
      clearAccessToken();
      expect(getAccessToken()).toBeNull();
      expect(isAccessTokenFresh()).toBe(false);
    });
  });

  describe('apiFetch — request shape', () => {
    it('prefixes the path with /api and attaches the current access token as a Bearer header', async () => {
      setAccessToken('tok-abc', new Date(Date.now() + 60_000).toISOString());
      fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await apiFetch('/journeys');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/journeys');
      expect((init.headers as Headers).get('Authorization')).toBe('Bearer tok-abc');
    });

    it('sends no Authorization header when there is no access token', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
      await apiFetch('/journeys');
      const [, init] = fetchMock.mock.calls[0];
      expect((init.headers as Headers).has('Authorization')).toBe(false);
    });

    it('JSON-encodes a plain object body and sets Content-Type', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
      await apiFetch('/journeys', { method: 'POST', body: { title: 'Fall 2026' } });
      const [, init] = fetchMock.mock.calls[0];
      expect((init.headers as Headers).get('Content-Type')).toBe('application/json');
      expect(init.body).toBe(JSON.stringify({ title: 'Fall 2026' }));
    });

    it('passes a FormData body through untouched, without forcing a JSON Content-Type', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
      const form = new FormData();
      form.set('file', new Blob(['hello']), 'hello.txt');
      await apiFetch('/documents', { method: 'POST', body: form });
      const [, init] = fetchMock.mock.calls[0];
      expect((init.headers as Headers).has('Content-Type')).toBe(false);
      expect(init.body).toBe(form);
    });

    it('returns undefined for a 204 No Content response without attempting to parse a body', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
      const result = await apiFetch('/sessions/abc');
      expect(result).toBeUndefined();
    });
  });

  describe('apiFetch — 401 -> refresh -> retry-once', () => {
    it('on a 401, calls /api/auth/refresh, then retries the original request once with the new token', async () => {
      setAccessToken('stale-token', new Date(Date.now() + 60_000).toISOString());
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401)) // original request
        .mockResolvedValueOnce(
          jsonResponse({ accessToken: 'fresh-token', accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString() }),
        ) // refresh
        .mockResolvedValueOnce(jsonResponse({ items: [] })); // retried original request

      const result = await apiFetch<{ items: unknown[] }>('/journeys');

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/refresh');
      const retryInit = fetchMock.mock.calls[2][1];
      expect((retryInit.headers as Headers).get('Authorization')).toBe('Bearer fresh-token');
      expect(result).toEqual({ items: [] });
      expect(getAccessToken()).toBe('fresh-token');
    });

    it('when refresh itself fails, does not retry and surfaces the ORIGINAL 401 error (not a refresh-specific one)', async () => {
      setAccessToken('stale-token', new Date(Date.now() + 60_000).toISOString());
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ message: 'Your session has expired' }, 401)) // original
        .mockResolvedValueOnce(new Response(null, { status: 401 })); // refresh also fails

      await expect(apiFetch('/journeys')).rejects.toMatchObject({
        statusCode: 401,
        message: 'Your session has expired',
      });
      expect(fetchMock).toHaveBeenCalledTimes(2); // no third (retry) call
      expect(getAccessToken()).toBeNull(); // refresh failure clears the stale token
    });

    it('skipAuthRetry never attempts a refresh, even on a 401 (used by the auth endpoints themselves to avoid a loop)', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Invalid credentials' }, 401));

      await expect(apiFetch('/auth/login', { method: 'POST', body: {}, skipAuthRetry: true })).rejects.toMatchObject({
        statusCode: 401,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('de-duplicates concurrent refresh attempts behind one in-flight call', async () => {
      setAccessToken('stale-token', new Date(Date.now() + 60_000).toISOString());
      let refreshCallCount = 0;
      fetchMock.mockImplementation((url: string) => {
        if (url === '/api/auth/refresh') {
          refreshCallCount += 1;
          return Promise.resolve(
            jsonResponse({ accessToken: 'fresh-token', accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString() }),
          );
        }
        // Every non-refresh call 401s once, then succeeds once the token has been refreshed.
        return Promise.resolve(getAccessToken() === 'fresh-token' ? jsonResponse({ ok: true }) : jsonResponse({}, 401));
      });

      const [a, b] = await Promise.all([apiFetch('/journeys'), apiFetch('/applications')]);

      expect(refreshCallCount).toBe(1);
      expect(a).toEqual({ ok: true });
      expect(b).toEqual({ ok: true });
    });
  });

  describe('apiFetch — error surfacing', () => {
    it('throws an ApiError carrying the server\'s message/error/requestId for a non-2xx JSON response', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ statusCode: 409, message: 'Already exists', error: 'Conflict', requestId: 'req-1' }, 409),
      );
      await expect(apiFetch('/journeys', { method: 'POST', body: {} })).rejects.toMatchObject({
        statusCode: 409,
        message: 'Already exists',
        errorName: 'Conflict',
        requestId: 'req-1',
      });
    });

    it('falls back to a friendly generic message for a non-2xx response with no JSON body', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
      await expect(apiFetch('/journeys')).rejects.toMatchObject({
        statusCode: 500,
        message: 'Something went wrong. Please try again.',
      });
    });
  });

  describe('friendlyErrorMessage', () => {
    it('returns an ApiError\'s own message', () => {
      expect(friendlyErrorMessage(new ApiError(404, 'Not found', 'Not Found'))).toBe('Not found');
    });

    it('returns a plain Error\'s message', () => {
      expect(friendlyErrorMessage(new Error('boom'))).toBe('boom');
    });

    it('falls back to a generic message for anything else', () => {
      expect(friendlyErrorMessage('a bare string')).toBe('Something went wrong. Please try again.');
      expect(friendlyErrorMessage(undefined)).toBe('Something went wrong. Please try again.');
    });
  });
});
