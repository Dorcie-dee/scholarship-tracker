import { withRoute } from '@/server/lib/api-handler';
import { parseBody } from '@/server/lib/validate';
import { ok } from '@/server/lib/response';
import { assertNotRateLimited } from '@/server/lib/rate-limit';
import { resetPasswordSchema } from '@/server/validation/auth';
import { resetPassword } from '@/server/services/auth.service';
import { getClientIp } from '@/server/services/auth-http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/reset-password — ported from
 * `AuthController.resetPassword()`. `@Throttle({ limit: 5, ttl: 900_000 })`
 * + `@StrictRateLimit()` in the original. Revokes every existing refresh
 * session for the account on success.
 */
export const POST = withRoute(
  async ({ req }) => {
    await assertNotRateLimited(`auth:reset-password:${getClientIp(req)}`, {
      max: 5,
      windowSeconds: 900,
      strict: true,
    });

    const body = await parseBody(req, resetPasswordSchema);
    await resetPassword(body.token, body.newPassword);

    return ok({ message: 'Password has been reset. Please log in again.' });
  },
  { auth: 'none' },
);
