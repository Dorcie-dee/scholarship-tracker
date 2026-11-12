import { withRoute } from '@/server/lib/api-handler';
import { parseBody, parseQuery } from '@/server/lib/validate';
import { created, ok } from '@/server/lib/response';
import {
  createOpportunitySourceSchema,
  listOpportunitySourcesQuerySchema,
} from '@/server/validation/opportunity-sources';
import { createOpportunitySource, listOpportunitySources } from '@/server/services/opportunity-sources.service';

export const dynamic = 'force-dynamic';

/** Owner-scoped — sources hang off an opportunity the caller owns. See `opportunity-sources.service.ts`'s doc comment. */
export const GET = withRoute(async ({ req, user }) => {
  const query = parseQuery(req.nextUrl.searchParams, listOpportunitySourcesQuerySchema);
  const result = await listOpportunitySources(user!.sub, query);
  return ok(result);
});

export const POST = withRoute(async ({ req, user }) => {
  const body = await parseBody(req, createOpportunitySourceSchema);
  const source = await createOpportunitySource(user!.sub, body);
  return created(source);
});
