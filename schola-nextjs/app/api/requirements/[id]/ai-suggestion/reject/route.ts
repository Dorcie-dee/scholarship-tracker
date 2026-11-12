import { withRoute } from '@/server/lib/api-handler';
import { ok } from '@/server/lib/response';
import { rejectRequirementSuggestion } from '@/server/services/requirement-ai.service';

export const dynamic = 'force-dynamic';

export const POST = withRoute<{ id: string }>(async ({ params, user }) => {
  const requirement = await rejectRequirementSuggestion(user!.sub, params.id);
  return ok(requirement);
});
