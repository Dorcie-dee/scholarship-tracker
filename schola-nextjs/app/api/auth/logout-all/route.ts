import { withRoute } from '@/server/lib/api-handler';
import { noContent } from '@/server/lib/response';
import { assertNotRateLimited } from '@/server/lib/rate-limit';
import { logoutAll } from '@/server/services/auth.service';
import { clearRefreshCookie, getClientIp } from '@/server/services/auth-http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/logout-all — ported from `AuthController.logoutAll()`. No
 * explicit `@Throttle()` override in the original (falls back to the app's
 * global default of 100 req/60s) — mirrored here as the same max/window,
 * applied strictly per this module's instructions.
 */
export const POST = withRoute(async ({ req, user }) => {
  await assertNotRateLimited(`auth:logout-all:${getClientIp(req)}`, {
    max: 100,
    windowSeconds: 60,
    strict: true,
  });

  await logoutAll(user!.sub);
  await clearRefreshCookie();

  return noContent();
});
