import { withRoute } from '@/server/lib/api-handler';
import { parseBody } from '@/server/lib/validate';
import { noContent, ok } from '@/server/lib/response';
import { updateOpportunitySchema } from '@/server/validation/opportunities';
import {
  deleteOpportunity,
  getOpportunityWithDetailsOrThrow,
  updateOpportunity,
} from '@/server/services/opportunities.service';

export const dynamic = 'force-dynamic';

/** Full detail load, including sources/requirements/deadlines — owner-only, like every other Opportunity route. */
export const GET = withRoute<{ id: string }>(async ({ params, user }) => {
  const opportunity = await getOpportunityWithDetailsOrThrow(params.id, user!.sub);
  return ok(opportunity);
});

export const PATCH = withRoute<{ id: string }>(async ({ req, params, user }) => {
  const body = await parseBody(req, updateOpportunitySchema);
  const opportunity = await updateOpportunity(params.id, user!.sub, body);
  return ok(opportunity);
});

export const DELETE = withRoute<{ id: string }>(async ({ params, user }) => {
  await deleteOpportunity(params.id, user!.sub);
  return noContent();
});
