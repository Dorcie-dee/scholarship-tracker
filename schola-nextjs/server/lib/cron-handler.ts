import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from './db';
import { buildErrorBody, HttpError, UnauthorizedError } from './http-errors';
import { getConfig } from './config';
import { timingSafeEqualStrings } from './timing-safe';

function assertValidCronSecret(req: NextRequest): void {
  const configured = getConfig().cron.secret;
  // No hardcoded fallback and no "unset means open" behavior — see
  // `config.ts`'s doc comment on `cron.secret`.
  if (!configured) {
    throw new UnauthorizedError('This endpoint is not configured.');
  }
  const header = req.headers.get('authorization');
  const presented = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;
  if (!presented || !timingSafeEqualStrings(presented, configured)) {
    throw new UnauthorizedError('Invalid or missing cron secret.');
  }
}

type CronHandler = (req: NextRequest) => Promise<NextResponse>;

/**
 * Wraps a scheduled-maintenance route handler (`/api/cron/*`) — shared-secret
 * auth instead of `withRoute()`'s Bearer-JWT auth (the caller here is an
 * external scheduler, not a logged-in user), but the same DB-connect-first
 * and error-envelope behavior as every other route in this app.
 */
export function withCronRoute(handler: CronHandler) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const requestId = req.headers.get('x-request-id') ?? randomUUID();
    const path = req.nextUrl.pathname;
    try {
      assertValidCronSecret(req);
      await connectToDatabase();
      const response = await handler(req);
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
