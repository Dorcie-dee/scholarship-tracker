import { withRoute } from '@/server/lib/api-handler';
import { noContent, ok } from '@/server/lib/response';
import { parseBody } from '@/server/lib/validate';
import { findTaskAccessible, removeTask, updateTask } from '@/server/services/tasks.service';
import { updateTaskSchema } from '@/server/validation/tasks';

export const dynamic = 'force-dynamic';

export const GET = withRoute<{ id: string }>(async ({ params, user }) => {
  const task = await findTaskAccessible(params.id, user!.sub);
  return ok(task);
});

export const PATCH = withRoute<{ id: string }>(async ({ req, params, user }) => {
  const dto = await parseBody(req, updateTaskSchema);
  const task = await updateTask(params.id, user!.sub, dto);
  return ok(task);
});

export const DELETE = withRoute<{ id: string }>(async ({ params, user }) => {
  await removeTask(params.id, user!.sub);
  return noContent();
});
