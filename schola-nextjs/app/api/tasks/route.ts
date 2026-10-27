import { withRoute } from '@/server/lib/api-handler';
import { created, ok } from '@/server/lib/response';
import { parseBody, parseQuery } from '@/server/lib/validate';
import { createTask, listTasks } from '@/server/services/tasks.service';
import { createTaskSchema, listTasksQuerySchema } from '@/server/validation/tasks';

export const dynamic = 'force-dynamic';

export const POST = withRoute(async ({ req, user }) => {
  const dto = await parseBody(req, createTaskSchema);
  const task = await createTask(user!.sub, dto);
  return created(task);
});

export const GET = withRoute(async ({ req, user }) => {
  const { journeyId, applicationId, cursor, limit, order } = parseQuery(
    req.nextUrl.searchParams,
    listTasksQuerySchema,
  );
  const result = await listTasks(user!.sub, { journeyId, applicationId }, { cursor, limit, order });
  return ok(result);
});
