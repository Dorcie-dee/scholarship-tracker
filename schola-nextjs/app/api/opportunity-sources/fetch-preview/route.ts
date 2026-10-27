import { withRoute } from '@/server/lib/api-handler';
import { parseBody } from '@/server/lib/validate';
import { ok } from '@/server/lib/response';
import { assertNotRateLimited } from '@/server/lib/rate-limit';
import { fetchUrlPreviewSchema } from '@/server/validation/opportunity-sources';
import { fetchSourcePreview } from '@/server/services/opportunity-sources.service';

export const dynamic = 'force-dynamic';

/**
 * Preview a public URL for capture — SSRF-hardened (`fetchUrlPreview()`),
 * rate-limited. Does not create an OpportunitySource or Opportunity.
 * Original backend used the global default throttle (100 req/60s,
 * `app.module.ts`) + `@StrictRateLimit()` (fail CLOSED on a rate-limit-store
 * outage, since this route's limit is itself a security control against
 * SSRF-probing abuse) — same numbers here, keyed per-user rather than
 * per-IP so one caller can't exhaust another's quota.
 */
export const POST = withRoute(async ({ req, user }) => {
  await assertNotRateLimited(`opportunity-sources:fetch-preview:${user!.sub}`, {
    max: 100,
    windowSeconds: 60,
    strict: true,
  });

  const { url } = await parseBody(req, fetchUrlPreviewSchema);
  const preview = await fetchSourcePreview(url);
  return ok(preview);
});
