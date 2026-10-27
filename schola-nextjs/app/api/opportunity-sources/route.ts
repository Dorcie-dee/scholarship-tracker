import { withRoute } from '@/server/lib/api-handler';
import { parseBody, parseQuery } from '@/server/lib/validate';
import { created, ok } from '@/server/lib/response';
import {
  createOpportunitySourceSchema,
  listOpportunitySourcesQuerySchema,
} from '@/server/validation/opportunity-sources';
import { createOpportunitySource, listOpportunitySources } from '@/server/services/opportunity-sources.service';

export const dynamic = 'force-dynamic';

/** Not ADMIN-gated — full CRUD is open to any authenticated user; sources hang off an opportunity they track. */
export const GET = withRoute(async ({ req }) => {
  const query = parseQuery(req.nextUrl.searchParams, listOpportunitySourcesQuerySchema);
  const result = await listOpportunitySources(query);
  return ok(result);
});

export const POST = withRoute(async ({ req }) => {
  const body = await parseBody(req, createOpportunitySourceSchema);
  const source = await createOpportunitySource(body);
  return created(source);
});
