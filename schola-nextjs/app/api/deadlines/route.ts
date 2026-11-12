import { withRoute } from '@/server/lib/api-handler';
import { created, ok } from '@/server/lib/response';
import { parseBody, parseQuery } from '@/server/lib/validate';
import { createDeadline, listDeadlines } from '@/server/services/deadlines.service';
import { createDeadlineSchema, listDeadlinesQuerySchema } from '@/server/validation/deadlines';

export const dynamic = 'force-dynamic';

export const POST = withRoute(async ({ req, user }) => {
  const dto = await parseBody(req, createDeadlineSchema);
  const deadline = await createDeadline(user!.sub, dto);
  return created(deadline);
});

export const GET = withRoute(async ({ req, user }) => {
  const { opportunityId, applicationId, taskId, requirementId, cursor, limit, order } = parseQuery(
    req.nextUrl.searchParams,
    listDeadlinesQuerySchema,
  );
  const result = await listDeadlines(
    user!.sub,
    { opportunityId, applicationId, taskId, requirementId },
    { cursor, limit, order },
  );
  return ok(result);
});
