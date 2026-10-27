import { withRoute } from '@/server/lib/api-handler';
import { parseBody, parseQuery } from '@/server/lib/validate';
import { created, ok } from '@/server/lib/response';
import { createOpportunitySchema, listOpportunitiesQuerySchema } from '@/server/validation/opportunities';
import { createOpportunity, listOpportunities } from '@/server/services/opportunities.service';

export const dynamic = 'force-dynamic';

export const GET = withRoute(async ({ req }) => {
  const query = parseQuery(req.nextUrl.searchParams, listOpportunitiesQuerySchema);
  const result = await listOpportunities(query);
  return ok(result);
});

/**
 * Opportunities are funding finds users are tracking (and optionally a
 * shared catalog). Any authenticated user may create one — recording "I
 * found this scholarship" is the primary product entry, not an admin-only
 * action. This is a deliberate, recent product change — PATCH/DELETE on
 * catalog rows stay ADMIN-only (shared reference curation); see
 * `docs/decisions.md`, "RBAC dependency" / its "Later refinement" note.
 */
export const POST = withRoute(async ({ req }) => {
  const body = await parseBody(req, createOpportunitySchema);
  const opportunity = await createOpportunity(body);
  return created(opportunity);
});
