import { withRoute } from '@/server/lib/api-handler';
import { ok } from '@/server/lib/response';
import { assertNotRateLimited } from '@/server/lib/rate-limit';
import { ServiceUnavailableError } from '@/server/lib/http-errors';
import { sendVerificationOtpEmail } from '@/server/lib/email';
import { resendVerification } from '@/server/services/auth.service';
import { getClientIp } from '@/server/services/auth-http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/resend-verification — ported from
 * `AuthController.resendVerification()`. `@Throttle({ limit: 3, ttl: 60_000
 * })` + `@StrictRateLimit()` in the original, on top of the service's own
 * data-layer resend cooldown.
 *
 * Unlike register() (best-effort) and forgot-password (must never reveal
 * delivery success/failure), the caller here is actively, authenticatedly
 * asking for a code right now: a failed send is surfaced as a clear,
 * actionable error rather than silently pretending it worked. The OTP row
 * already exists either way — nothing is left inconsistent by this failing.
 */
export const POST = withRoute(async ({ req, user }) => {
  await assertNotRateLimited(`auth:resend-verification:${getClientIp(req)}`, {
    max: 3,
    windowSeconds: 60,
    strict: true,
  });

  const { otp, expiresAt } = await resendVerification(user!.sub);

  try {
    await sendVerificationOtpEmail({ to: user!.email, otp, expiresAt });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      `Failed to send verification email to user ${user!.sub}:`,
      error instanceof Error ? error.message : error,
    );
    throw new ServiceUnavailableError(
      'Failed to send the verification email. Please try again shortly.',
    );
  }

  return ok({ sent: true });
});
