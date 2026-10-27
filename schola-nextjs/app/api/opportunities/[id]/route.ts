import { withRoute } from '@/server/lib/api-handler';
import { parseBody } from '@/server/lib/validate';
import { noContent, ok } from '@/server/lib/response';
import { UserRole } from '@/server/lib/enums';
import { updateOpportunitySchema } from '@/server/validation/opportunities';
import {
  deleteOpportunity,
  getOpportunityWithDetailsOrThrow,
  updateOpportunity,
} from '@/server/services/opportunities.service';

export const dynamic = 'force-dynamic';

/** Full detail load, including sources/requirements/deadlines — any authenticated user may read. */
export const GET = withRoute<{ id: string }>(async ({ params }) => {
  const opportunity = await getOpportunityWithDetailsOrThrow(params.id);
  return ok(opportunity);
});

/** Shared-catalog curation — ADMIN-only, unlike POST (see /opportunities/route.ts's doc comment). */
export const PATCH = withRoute<{ id: string }>(
  async ({ req, params }) => {
    const body = await parseBody(req, updateOpportunitySchema);
    const opportunity = await updateOpportunity(params.id, body);
    return ok(opportunity);
  },
  { roles: [UserRole.ADMIN] },
);

export const DELETE = withRoute<{ id: string }>(
  async ({ params }) => {
    await deleteOpportunity(params.id);
    return noContent();
  },
  { roles: [UserRole.ADMIN] },
);
