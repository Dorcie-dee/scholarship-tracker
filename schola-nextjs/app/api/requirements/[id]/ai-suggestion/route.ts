import { withRoute } from '@/server/lib/api-handler';
import { ok } from '@/server/lib/response';
import { assertNotRateLimited } from '@/server/lib/rate-limit';
import { suggestRequirementStatus } from '@/server/services/requirement-ai.service';

export const dynamic = 'force-dynamic';

/**
 * AI-adjacent endpoint — strictly rate-limited per caller (not per-IP, so one
 * user can't exhaust another's quota). No documented config knob for this
 * route specifically, so this picks a conservative default (20 req/60s),
 * matching the "StrictRateLimit" convention used for the other AI/SSRF-
 * adjacent route (`opportunity-sources/fetch-preview`) — fail CLOSED on a
 * rate-limit-store outage, since this is a sensitive, cost-bearing action.
 */
export const POST = withRoute<{ id: string }>(async ({ params, user }) => {
  await assertNotRateLimited(`requirements:ai-suggestion:${user!.sub}`, {
    max: 20,
    windowSeconds: 60,
    strict: true,
  });

  const requirement = await suggestRequirementStatus(user!.sub, params.id);
  return ok(requirement);
});
