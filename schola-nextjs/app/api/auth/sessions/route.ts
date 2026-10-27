import { withRoute } from '@/server/lib/api-handler';
import { ok } from '@/server/lib/response';
import { assertNotRateLimited } from '@/server/lib/rate-limit';
import { listSessions } from '@/server/services/auth.service';
import { getClientIp } from '@/server/services/auth-http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/sessions — ported from `AuthController.sessions()`. No
 * explicit `@Throttle()` override in the original (falls back to the app's
 * global default of 100 req/60s) — mirrored here as the same max/window,
 * applied strictly per this module's instructions.
 */
export const GET = withRoute(async ({ req, user }) => {
  await assertNotRateLimited(`auth:sessions:${getClientIp(req)}`, {
    max: 100,
    windowSeconds: 60,
    strict: true,
  });

  const sessions = await listSessions(user!.sub);
  return ok(sessions);
});
