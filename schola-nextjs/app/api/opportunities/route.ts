import { withRoute } from '@/server/lib/api-handler';
import { parseBody, parseQuery } from '@/server/lib/validate';
import { created, ok } from '@/server/lib/response';
import { createOpportunitySchema, listOpportunitiesQuerySchema } from '@/server/validation/opportunities';
import { createOpportunity, listOpportunities } from '@/server/services/opportunities.service';

export const dynamic = 'force-dynamic';

/**
 * Opportunities are personal workspace data — see `opportunities.service.ts`'s
 * doc comment and `docs/decisions.md`, "Catalog data vs. owned data
 * (superseded)". Every authenticated user manages only their own.
 */
export const GET = withRoute(async ({ req, user }) => {
  const query = parseQuery(req.nextUrl.searchParams, listOpportunitiesQuerySchema);
  const result = await listOpportunities(user!.sub, query);
  return ok(result);
});

export const POST = withRoute(async ({ req, user }) => {
  const body = await parseBody(req, createOpportunitySchema);
  const opportunity = await createOpportunity(user!.sub, body);
  return created(opportunity);
});
