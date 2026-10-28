import type { NextRequest } from 'next/server';

/**
 * Lives in `lib/` (not `services/auth-http.ts`, which re-exports it for the
 * existing call sites) so `api-handler.ts`'s default rate-limit baseline can
 * use it without a lib-importing-from-services layering inversion.
 */
export function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
}
