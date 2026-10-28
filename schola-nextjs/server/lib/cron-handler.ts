import { timingSafeEqual, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from './db';
import { buildErrorBody, HttpError, UnauthorizedError } from './http-errors';
import { getConfig } from './config';

/**
 * Constant-time string comparison — a plain `===` on the presented vs.
 * configured secret would let an attacker infer how many leading
 * characters they'd guessed right from response-time differences alone,
 * the same class of issue a per-byte loop/early-return comparison has.
 */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // `timingSafeEqual` throws on mismatched lengths, and a naive
  // length-check-then-compare short-circuits BEFORE the constant-time
  // comparison for a wrong-length guess — which is itself a timing leak
  // (a wrong-length guess returns near-instantly; a right-length-wrong-
  // content one takes measurably longer). Padding both to the same length
  // and running the real comparison unconditionally first avoids that: the
  // length check below only ever cheaply combines with an already-computed
  // constant-time result, never gates whether that computation happens.
  const length = Math.max(bufA.length, bufB.length, 1);
  const paddedA = Buffer.alloc(length);
  const paddedB = Buffer.alloc(length);
  bufA.copy(paddedA);
  bufB.copy(paddedB);
  const paddedContentsMatch = timingSafeEqual(paddedA, paddedB);
  return paddedContentsMatch && bufA.length === bufB.length;
}

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
