import { withRoute } from '@/server/lib/api-handler';
import { noContent, ok } from '@/server/lib/response';
import { parseBody } from '@/server/lib/validate';
import {
  findRequirementAccessible,
  removeRequirement,
  updateRequirement,
} from '@/server/services/requirements.service';
import { updateRequirementSchema } from '@/server/validation/requirements';

export const dynamic = 'force-dynamic';

export const GET = withRoute<{ id: string }>(async ({ params, user }) => {
  const requirement = await findRequirementAccessible(params.id, user!.sub);
  return ok(requirement);
});

export const PATCH = withRoute<{ id: string }>(async ({ req, params, user }) => {
  const dto = await parseBody(req, updateRequirementSchema);
  const requirement = await updateRequirement(params.id, user!.sub, dto);
  return ok(requirement);
});

export const DELETE = withRoute<{ id: string }>(async ({ params, user }) => {
  await removeRequirement(params.id, user!.sub);
  return noContent();
});
