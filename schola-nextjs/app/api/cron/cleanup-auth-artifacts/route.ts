import { ok } from '@/server/lib/response';
import { withCronRoute } from '@/server/lib/cron-handler';
import { cleanupExpiredAuthArtifacts } from '@/server/services/auth.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/cleanup-auth-artifacts — the scheduled-trigger counterpart
 * to `server/scripts/cleanup-auth-artifacts.ts` (same underlying function).
 * Requires `Authorization: Bearer <CRON_SECRET>` — see
 * `server/lib/cron-handler.ts`.
 */
export const POST = withCronRoute(async () => {
  const result = await cleanupExpiredAuthArtifacts();
  return ok(result);
});
