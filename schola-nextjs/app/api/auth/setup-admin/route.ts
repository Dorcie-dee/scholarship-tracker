import { withRoute } from '@/server/lib/api-handler';
import { parseBody } from '@/server/lib/validate';
import { created } from '@/server/lib/response';
import { assertNotRateLimited } from '@/server/lib/rate-limit';
import type { AuthTokenResponse } from '@/server/lib/enums';
import { setupAdminSchema } from '@/server/validation/auth';
import { setupAdmin } from '@/server/services/auth.service';
import { buildRequestMeta, getClientIp, setRefreshCookie } from '@/server/services/auth-http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/setup-admin — the only way to create the platform's first
 * administrator; see `setupAdmin()`'s doc comment for the double-gating
 * (shared secret + "no admin may already exist"). Rate-limited tighter than
 * `/auth/register` since the secret itself is the only thing standing
 * between a guesser and an admin account.
 */
export const POST = withRoute(
  async ({ req }) => {
    await assertNotRateLimited(`auth:setup-admin:${getClientIp(req)}`, {
      max: 5,
      windowSeconds: 60,
      strict: true,
    });

    const body = await parseBody(req, setupAdminSchema);
    const meta = buildRequestMeta(req);

    const { user, tokens } = await setupAdmin(body, meta);

    await setRefreshCookie(tokens);

    return created<AuthTokenResponse>({
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
      user,
    });
  },
  { auth: 'none' },
);
