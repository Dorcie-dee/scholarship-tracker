import { withRoute } from '@/server/lib/api-handler';
import { noContent } from '@/server/lib/response';
import { detachDocument } from '@/server/services/applications.service';

export const dynamic = 'force-dynamic';

/** Detach — removes only the join row. See `applications.service.ts`'s `detachDocument()` doc comment. */
export const DELETE = withRoute<{ id: string; documentId: string }>(async (ctx) => {
  await detachDocument(ctx.user!.sub, ctx.params.id, ctx.params.documentId);
  return noContent();
});
