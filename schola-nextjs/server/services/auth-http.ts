import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getConfig } from '../lib/config';
import { getClientIp } from '../lib/request-ip';
import type { IssuedTokens, RequestMeta } from './auth.service';

export { getClientIp };

/**
 * The thin HTTP-layer glue the `/api/auth/*` route handlers share: pulling
 * request metadata (IP/user-agent) for session records, and reading/writing
 * the refresh-token cookie. Kept separate from `auth.service.ts` so that
 * file stays framework-agnostic (plain functions a test can call directly,
 * with no Next.js request/response context required) — this file is the
 * only place in the auth module that touches `next/headers`.
 *
 * Ported from the NestJS backend's `auth.controller.ts` private helpers
 * (`setRefreshCookie`/`clearRefreshCookie`/`readRefreshCookie`/
 * `requestMeta`).
 */

export function buildRequestMeta(req: NextRequest): RequestMeta {
  const ip = getClientIp(req);
  return {
    userAgent: req.headers.get('user-agent'),
    ipAddress: ip === 'unknown' ? null : ip,
  };
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: getConfig().isProduction,
    sameSite: 'lax' as const,
    // Matches this project's single-origin `/api/auth/*` route prefix (the
    // original two-repo backend's equivalent path was '/api/auth' behind its
    // global 'api' prefix + the 'auth' controller route).
    path: '/api/auth',
    maxAge: maxAgeSeconds,
  };
}

export async function setRefreshCookie(tokens: IssuedTokens): Promise<void> {
  const { refreshCookieName } = getConfig().auth;
  const maxAgeSeconds = Math.max(
    0,
    Math.floor((tokens.refreshTokenExpiresAt.getTime() - Date.now()) / 1000),
  );
  const store = await cookies();
  store.set(refreshCookieName, tokens.refreshToken, cookieOptions(maxAgeSeconds));
}

export async function clearRefreshCookie(): Promise<void> {
  const { refreshCookieName } = getConfig().auth;
  const store = await cookies();
  store.set(refreshCookieName, '', cookieOptions(0));
}

export async function readRefreshCookie(): Promise<string | undefined> {
  const { refreshCookieName } = getConfig().auth;
  const store = await cookies();
  return store.get(refreshCookieName)?.value;
}
