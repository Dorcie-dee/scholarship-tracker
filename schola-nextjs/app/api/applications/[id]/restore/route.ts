import { withRoute } from '@/server/lib/api-handler';
import { ok } from '@/server/lib/response';
import { restoreApplication } from '@/server/services/applications.service';

export const dynamic = 'force-dynamic';

/** Owner-only restore of a soft-deleted application (within retention). */
export const POST = withRoute<{ id: string }>(async (ctx) => {
  const application = await restoreApplication(ctx.params.id, ctx.user!.sub);
  return ok(application);
});
