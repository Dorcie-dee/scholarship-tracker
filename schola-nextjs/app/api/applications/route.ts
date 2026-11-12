import { withRoute } from '@/server/lib/api-handler';
import { created, ok } from '@/server/lib/response';
import { parseBody, parseQuery } from '@/server/lib/validate';
import { createApplication, listApplicationsForUser } from '@/server/services/applications.service';
import { createApplicationSchema, listApplicationsQuerySchema } from '@/server/validation/applications';

export const dynamic = 'force-dynamic';

export const POST = withRoute(async (ctx) => {
  const dto = await parseBody(ctx.req, createApplicationSchema);
  const application = await createApplication(ctx.user!.sub, dto);
  return created(application);
});

export const GET = withRoute(async (ctx) => {
  const { journeyId, ...pagination } = parseQuery(ctx.req.nextUrl.searchParams, listApplicationsQuerySchema);
  const result = await listApplicationsForUser(ctx.user!.sub, journeyId, pagination);
  return ok(result);
});
