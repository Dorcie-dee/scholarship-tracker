import { withRoute } from '@/server/lib/api-handler';
import { parseBody } from '@/server/lib/validate';
import { created } from '@/server/lib/response';
import { assertNotRateLimited } from '@/server/lib/rate-limit';
import { sendVerificationOtpEmail } from '@/server/lib/email';
import type { AuthTokenResponse } from '@/server/lib/enums';
import { registerSchema } from '@/server/validation/auth';
import { register } from '@/server/services/auth.service';
import { buildRequestMeta, getClientIp, setRefreshCookie } from '@/server/services/auth-http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/register — ported from `AuthController.register()`.
 * `@Throttle({ limit: 10, ttl: 60_000 })` + `@StrictRateLimit()` in the
 * original.
 */
export const POST = withRoute(
  async ({ req }) => {
    await assertNotRateLimited(`auth:register:${getClientIp(req)}`, {
      max: 10,
      windowSeconds: 60,
      strict: true,
    });

    const body = await parseBody(req, registerSchema);
    const meta = buildRequestMeta(req);

    const { user, tokens, pendingOtp } = await register(body, meta);

    // Best-effort — a failure to send the verification email must not fail
    // registration itself; the account and its OTP row both already exist,
    // and the user has a resend path (see register()'s doc comment).
    if (pendingOtp) {
      try {
        await sendVerificationOtpEmail({
          to: user.email,
          otp: pendingOtp.otp,
          expiresAt: pendingOtp.expiresAt,
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
          `Failed to send verification email for user ${user.id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    await setRefreshCookie(tokens);

    return created<AuthTokenResponse>({
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
      user,
    });
  },
  { auth: 'none' },
);
