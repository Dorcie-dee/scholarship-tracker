import { withRoute } from '@/server/lib/api-handler';
import { noContent, ok } from '@/server/lib/response';
import { deleteSnapshot, getSnapshot } from '@/server/services/applications.service';

export const dynamic = 'force-dynamic';

/** `404` if `:snapshotId` belongs to a different Application, even one the caller owns. */
export const GET = withRoute<{ id: string; snapshotId: string }>(async (ctx) => {
  const snapshot = await getSnapshot(ctx.user!.sub, ctx.params.id, ctx.params.snapshotId);
  return ok(snapshot);
});

/** Explicit delete — descendants keep lineage with `supersedesSnapshotId` cleared, not cascaded. */
export const DELETE = withRoute<{ id: string; snapshotId: string }>(async (ctx) => {
  await deleteSnapshot(ctx.user!.sub, ctx.params.id, ctx.params.snapshotId);
  return noContent();
});
