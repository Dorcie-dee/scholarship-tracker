import { withRoute } from '@/server/lib/api-handler';
import { parseBody } from '@/server/lib/validate';
import { ok } from '@/server/lib/response';
import { assertNotRateLimited } from '@/server/lib/rate-limit';
import { verifyEmailSchema } from '@/server/validation/auth';
import { verifyEmail } from '@/server/services/auth.service';
import { getClientIp } from '@/server/services/auth-http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/verify-email — ported from `AuthController.verifyEmail()`.
 * `@Throttle({ limit: 10, ttl: 60_000 })` + `@StrictRateLimit()` in the
 * original. Authenticated (not public) — acts on the caller's own account
 * only, never a client-supplied email, deliberately: requiring a valid
 * access token as the sole gate means there is no email/code-guessing
 * surface to rate-limit against arbitrary accounts in the first place.
 */
export const POST = withRoute(async ({ req, user }) => {
  await assertNotRateLimited(`auth:verify-email:${getClientIp(req)}`, {
    max: 10,
    windowSeconds: 60,
    strict: true,
  });

  const body = await parseBody(req, verifyEmailSchema);
  await verifyEmail(user!.sub, body.code);

  return ok({ verified: true });
});
