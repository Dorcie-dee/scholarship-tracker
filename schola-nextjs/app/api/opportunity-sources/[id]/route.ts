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

/** Not ADMIN-gated — see /opportunity-sources/route.ts's doc comment. */
export const GET = withRoute<{ id: string }>(async ({ params }) => {
  const source = await getOpportunitySourceOrThrow(params.id);
  return ok(source);
});

export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => {
  const body = await parseBody(req, updateOpportunitySourceSchema);
  const source = await updateOpportunitySource(params.id, body);
  return ok(source);
});

export const DELETE = withRoute<{ id: string }>(async ({ params }) => {
  await deleteOpportunitySource(params.id);
  return noContent();
});
