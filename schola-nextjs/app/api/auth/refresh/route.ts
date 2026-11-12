import { withRoute } from '@/server/lib/api-handler';
import { ok } from '@/server/lib/response';
import { assertNotRateLimited } from '@/server/lib/rate-limit';
import { UnauthorizedError } from '@/server/lib/http-errors';
import type { AuthTokenResponse } from '@/server/lib/enums';
import { refresh } from '@/server/services/auth.service';
import {
  buildRequestMeta,
  getClientIp,
  readRefreshCookie,
  setRefreshCookie,
} from '@/server/services/auth-http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/refresh — ported from `AuthController.refresh()`. Generous
 * limit (`@Throttle({ limit: 20, ttl: 60_000 })` + `@StrictRateLimit()` in
 * the original): legitimate clients refresh routinely (e.g. on every page
 * load) — this is a backstop against gross abuse, not a tight limit.
 */
export const POST = withRoute(
  async ({ req }) => {
    await assertNotRateLimited(`auth:refresh:${getClientIp(req)}`, {
      max: 20,
      windowSeconds: 60,
      strict: true,
    });

    const presented = await readRefreshCookie();
    if (!presented) {
      throw new UnauthorizedError('No refresh token provided');
    }

    const meta = buildRequestMeta(req);
    const { user, tokens } = await refresh(presented, meta);

    await setRefreshCookie(tokens);

    return ok<AuthTokenResponse>({
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
      user,
    });
  },
  { auth: 'none' },
);
