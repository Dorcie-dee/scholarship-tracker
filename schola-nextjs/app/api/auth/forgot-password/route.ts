import { withRoute } from '@/server/lib/api-handler';
import { parseBody } from '@/server/lib/validate';
import { ok } from '@/server/lib/response';
import { assertNotRateLimited } from '@/server/lib/rate-limit';
import { getConfig } from '@/server/lib/config';
import { sendPasswordResetEmail } from '@/server/lib/email';
import { forgotPasswordSchema } from '@/server/validation/auth';
import { forgotPassword } from '@/server/services/auth.service';
import { getClientIp } from '@/server/services/auth-http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/forgot-password — ported from
 * `AuthController.forgotPassword()`. `@Throttle({ limit: 3, ttl: 900_000 })`
 * + `@StrictRateLimit()` in the original. Always returns the same generic
 * response, whether or not the account exists — a delivery failure here is
 * swallowed (logged, not thrown): surfacing it would create a response-
 * shape oracle distinguishing "account exists but email failed" from
 * "account doesn't exist".
 */
export const POST = withRoute(
  async ({ req }) => {
    await assertNotRateLimited(`auth:forgot-password:${getClientIp(req)}`, {
      max: 3,
      windowSeconds: 900,
      strict: true,
    });

    const body = await parseBody(req, forgotPasswordSchema);
    const result = await forgotPassword(body.email);

    if (result) {
      const { passwordResetExpiryMinutes } = getConfig().auth;
      try {
        await sendPasswordResetEmail({
          to: result.user.email,
          rawToken: result.rawToken,
          expiryMinutes: passwordResetExpiryMinutes,
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
          `Failed to send password-reset email to user ${result.user.id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    return ok({
      message:
        'If an account exists for that email, password reset instructions have been sent.',
    });
  },
  { auth: 'none' },
);
