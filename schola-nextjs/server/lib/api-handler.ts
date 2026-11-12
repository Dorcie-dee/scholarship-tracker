import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from './db';
import { verifyAccessToken, type AccessTokenClaims } from './auth';
import { buildErrorBody, ForbiddenError, HttpError, UnauthorizedError } from './http-errors';
import { assertNotRateLimited } from './rate-limit';
import { getClientIp } from './request-ip';
import type { UserRole } from './enums';
import { User } from '../models/user.model';

/**
 * Applied to every authenticated route that doesn't already call
 * `assertNotRateLimited` itself — a generous abuse-prevention baseline
 * (document upload, CRUD, profile updates, catalog browsing, etc. had NO
 * rate limit at all before this), not a replacement for the tighter,
 * `strict: true` per-route limits already on the auth/SSRF-adjacent routes.
 * Fails OPEN (default `strict: false`) on a rate-limit-store error — a
 * transient DB blip must not take down every route in the app.
 */
const DEFAULT_ROUTE_RATE_LIMIT = { max: 300, windowSeconds: 60 };

export interface RouteContext<P extends Record<string, string> = Record<string, string>> {
  req: NextRequest;
  params: P;
  requestId: string;
  /** Null only when `auth: 'optional'` and no/invalid token was supplied. */
  user: AccessTokenClaims | null;
}

type Handler<P extends Record<string, string>> = (
  ctx: RouteContext<P>,
) => Promise<NextResponse>;

interface RouteOptions {
  /** 'required' (default) rejects with 401 if no valid Bearer token is present. */
  auth?: 'required' | 'optional' | 'none';
  /** If set, the authenticated user's role must be one of these (implies auth: 'required'). */
  roles?: UserRole[];
}

async function extractUser(req: NextRequest): Promise<AccessTokenClaims | null> {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;
  return verifyAccessToken(token);
}

/**
 * Wraps a Next.js route-handler body with: DB connection, Bearer-token auth
 * extraction/enforcement, role enforcement, and the same error envelope +
 * `X-Request-Id` header the original NestJS backend returned (see
 * `server/lib/http-errors.ts`) — so the ported frontend's `friendlyApiMessage()`
 * / `ApiError` handling needs no changes.
 */
export function withRoute<P extends Record<string, string> = Record<string, string>>(
  handler: Handler<P>,
  options: RouteOptions = {},
) {
  return async (
    req: NextRequest,
    routeCtx: { params: Promise<P> },
  ): Promise<NextResponse> => {
    const requestId = req.headers.get('x-request-id') ?? randomUUID();
    const path = req.nextUrl.pathname;
    const authMode = options.roles ? 'required' : (options.auth ?? 'required');

    try {
      await connectToDatabase();

      let user: AccessTokenClaims | null = null;
      if (authMode !== 'none') {
        user = await extractUser(req);
        if (!user && authMode === 'required') {
          throw new UnauthorizedError('Missing or invalid access token');
        }
      }
      if (options.roles) {
        // A live DB read, not the (possibly stale) JWT claim — ported from
        // the original `RolesGuard`'s doc comment: "authorization uses the
        // user's current role from the database ... so demotion takes
        // effect immediately for admin-only routes." Only paid on
        // role-gated routes — an ordinary authenticated route never pays
        // this extra query.
        const currentRole = user
          ? ((await User.findById(user.sub).select('role').lean()) as { role: UserRole } | null)
              ?.role
          : undefined;
        if (!currentRole || !options.roles.includes(currentRole)) {
          throw new ForbiddenError('Insufficient role for this action');
        }
        user = { ...(user as AccessTokenClaims), role: currentRole };
      }

      if (authMode !== 'none') {
        const key = user ? `route:user:${user.sub}` : `route:ip:${getClientIp(req)}`;
        await assertNotRateLimited(key, DEFAULT_ROUTE_RATE_LIMIT);
      }

      const params = await routeCtx.params;
      const response = await handler({ req, params, requestId, user });
      response.headers.set('X-Request-Id', requestId);
      return response;
    } catch (err) {
      if (!(err instanceof HttpError)) {
        // eslint-disable-next-line no-console
        console.error(`[${requestId}] Unhandled error on ${path}:`, err);
      }
      const body = buildErrorBody(err, path, requestId);
      const response = NextResponse.json(body, { status: body.statusCode });
      response.headers.set('X-Request-Id', requestId);
      return response;
    }
  };
}
