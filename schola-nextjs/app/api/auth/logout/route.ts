import { withRoute } from '@/server/lib/api-handler';
import { noContent } from '@/server/lib/response';
import { assertNotRateLimited } from '@/server/lib/rate-limit';
import { logout } from '@/server/services/auth.service';
import { clearRefreshCookie, getClientIp, readRefreshCookie } from '@/server/services/auth-http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/logout — ported from `AuthController.logout()`.
 * Deliberately `auth: 'none'`: this acts on the refresh cookie only, not the
 * access token, so it must keep working even once the access token has
 * already expired — otherwise a user with a dead access token but a valid
 * refresh cookie could never log out. The original had no explicit
 * `@Throttle()`/`@StrictRateLimit()` override (so it fell back to the app's
 * global default throttle of 100 req/60s); mirrored here as the same
 * max/window, applied strictly per this module's instructions.
 */
export const POST = withRoute(
  async ({ req }) => {
    await assertNotRateLimited(`auth:logout:${getClientIp(req)}`, {
      max: 100,
      windowSeconds: 60,
      strict: true,
    });

    const presented = await readRefreshCookie();
    if (presented) {
      await logout(presented);
    }
    await clearRefreshCookie();

    return noContent();
  },
  { auth: 'none' },
);
