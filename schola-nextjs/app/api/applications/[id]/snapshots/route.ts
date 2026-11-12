import { withRoute } from '@/server/lib/api-handler';
import { created, ok } from '@/server/lib/response';
import { parseBody } from '@/server/lib/validate';
import { createSnapshot, listSnapshots } from '@/server/services/applications.service';
import { createApplicationSnapshotSchema } from '@/server/validation/application-snapshots';

export const dynamic = 'force-dynamic';

export const POST = withRoute<{ id: string }>(async (ctx) => {
  const dto = await parseBody(ctx.req, createApplicationSnapshotSchema);
  const snapshot = await createSnapshot(ctx.user!.sub, ctx.params.id, dto);
  return created(snapshot);
});

/** Creation order, oldest first. */
export const GET = withRoute<{ id: string }>(async (ctx) => {
  const snapshots = await listSnapshots(ctx.user!.sub, ctx.params.id);
  return ok(snapshots);
});
