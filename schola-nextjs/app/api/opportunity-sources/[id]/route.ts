import { withRoute } from '@/server/lib/api-handler';
import { parseBody } from '@/server/lib/validate';
import { noContent, ok } from '@/server/lib/response';
import { updateOpportunitySourceSchema } from '@/server/validation/opportunity-sources';
import {
  deleteOpportunitySource,
  getOpportunitySourceOrThrow,
  updateOpportunitySource,
} from '@/server/services/opportunity-sources.service';

export const dynamic = 'force-dynamic';

export const GET = withRoute<{ id: string }>(async ({ params, user }) => {
  const source = await getOpportunitySourceOrThrow(params.id, user!.sub);
  return ok(source);
});

export const PATCH = withRoute<{ id: string }>(async ({ req, params, user }) => {
  const body = await parseBody(req, updateOpportunitySourceSchema);
  const source = await updateOpportunitySource(params.id, user!.sub, body);
  return ok(source);
});

export const DELETE = withRoute<{ id: string }>(async ({ params, user }) => {
  await deleteOpportunitySource(params.id, user!.sub);
  return noContent();
});
