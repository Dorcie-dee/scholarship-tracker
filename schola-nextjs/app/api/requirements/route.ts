import { withRoute } from '@/server/lib/api-handler';
import { created, ok } from '@/server/lib/response';
import { parseBody, parseQuery } from '@/server/lib/validate';
import { createRequirement, listRequirements } from '@/server/services/requirements.service';
import { createRequirementSchema, listRequirementsQuerySchema } from '@/server/validation/requirements';

export const dynamic = 'force-dynamic';

export const POST = withRoute(async ({ req, user }) => {
  const dto = await parseBody(req, createRequirementSchema);
  const requirement = await createRequirement(user!.sub, dto);
  return created(requirement);
});

/** At least one of opportunityId/applicationId is required — enforced by the service, not here. */
export const GET = withRoute(async ({ req, user }) => {
  const { opportunityId, applicationId, cursor, limit, order } = parseQuery(
    req.nextUrl.searchParams,
    listRequirementsQuerySchema,
  );
  const result = await listRequirements(user!.sub, { opportunityId, applicationId }, { cursor, limit, order });
  return ok(result);
});
