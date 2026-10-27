import { withRoute } from '@/server/lib/api-handler';
import { noContent, ok } from '@/server/lib/response';
import { parseBody } from '@/server/lib/validate';
import { findDeadlineAccessible, removeDeadline, updateDeadline } from '@/server/services/deadlines.service';
import { updateDeadlineSchema } from '@/server/validation/deadlines';

export const dynamic = 'force-dynamic';

export const GET = withRoute<{ id: string }>(async ({ params, user }) => {
  const deadline = await findDeadlineAccessible(params.id, user!.sub);
  return ok(deadline);
});

export const PATCH = withRoute<{ id: string }>(async ({ req, params, user }) => {
  const dto = await parseBody(req, updateDeadlineSchema);
  const deadline = await updateDeadline(params.id, user!.sub, dto);
  return ok(deadline);
});

export const DELETE = withRoute<{ id: string }>(async ({ params, user }) => {
  await removeDeadline(params.id, user!.sub);
  return noContent();
});
