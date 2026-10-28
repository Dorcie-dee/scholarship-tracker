import { ok } from '@/server/lib/response';
import { withCronRoute } from '@/server/lib/cron-handler';
import { purgeExpiredApplications } from '@/server/services/applications.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/purge-applications — the scheduled-trigger counterpart to
 * `server/scripts/purge-applications.ts` (same underlying function; this is
 * the HTTP entry point an external scheduler calls instead of shelling out
 * to the CLI script). Requires `Authorization: Bearer <CRON_SECRET>` — see
 * `server/lib/cron-handler.ts`.
 */
export const POST = withCronRoute(async () => {
  const purgedCount = await purgeExpiredApplications();
  return ok({ purgedCount });
});
