import { withRoute } from '@/server/lib/api-handler';
import { parseBody } from '@/server/lib/validate';
import { ok } from '@/server/lib/response';
import { assertNotRateLimited } from '@/server/lib/rate-limit';
import type { AuthTokenResponse } from '@/server/lib/enums';
import { loginSchema } from '@/server/validation/auth';
import { login } from '@/server/services/auth.service';
import { buildRequestMeta, getClientIp, setRefreshCookie } from '@/server/services/auth-http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/login — ported from `AuthController.login()`.
 * `@Throttle({ limit: 5, ttl: 60_000 })` + `@StrictRateLimit()` (IP-based) in
 * the original, on top of the account-scoped lockout `login()` itself
 * enforces via `server/lib/rate-limit.ts`.
 */
export const POST = withRoute(
  async ({ req }) => {
    await assertNotRateLimited(`auth:login:${getClientIp(req)}`, {
      max: 5,
      windowSeconds: 60,
      strict: true,
    });

    const body = await parseBody(req, loginSchema);
    const meta = buildRequestMeta(req);

    const { user, tokens } = await login(body.email, body.password, meta);

    await setRefreshCookie(tokens);

    return ok<AuthTokenResponse>({
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
      user,
    });
  },
  { auth: 'none' },
);
