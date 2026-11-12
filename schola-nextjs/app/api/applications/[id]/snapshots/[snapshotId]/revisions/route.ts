import { withRoute } from '@/server/lib/api-handler';
import { created } from '@/server/lib/response';
import { parseBody } from '@/server/lib/validate';
import { createSnapshotRevision } from '@/server/services/applications.service';
import { editApplicationSnapshotSchema } from '@/server/validation/application-snapshots';

export const dynamic = 'force-dynamic';

/** Append-only edit — creates a new revision that supersedes `:snapshotId`. */
export const POST = withRoute<{ id: string; snapshotId: string }>(async (ctx) => {
  const dto = await parseBody(ctx.req, editApplicationSnapshotSchema);
  const revision = await createSnapshotRevision(ctx.user!.sub, ctx.params.id, ctx.params.snapshotId, dto);
  return created(revision);
});
