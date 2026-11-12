import { withRoute } from '@/server/lib/api-handler';
import { created, ok } from '@/server/lib/response';
import { parseBody } from '@/server/lib/validate';
import { attachDocument, listApplicationDocuments } from '@/server/services/applications.service';
import { attachDocumentSchema } from '@/server/validation/application-documents';

export const dynamic = 'force-dynamic';

export const POST = withRoute<{ id: string }>(async (ctx) => {
  const dto = await parseBody(ctx.req, attachDocumentSchema);
  const link = await attachDocument(ctx.user!.sub, ctx.params.id, dto);
  return created(link);
});

export const GET = withRoute<{ id: string }>(async (ctx) => {
  const links = await listApplicationDocuments(ctx.user!.sub, ctx.params.id);
  return ok(links);
});
