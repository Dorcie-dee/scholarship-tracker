import { withRoute } from '@/server/lib/api-handler';
import { created, ok } from '@/server/lib/response';
import { parseBody, parseQuery } from '@/server/lib/validate';
import { createJourney, listJourneysForUser } from '@/server/services/journeys.service';
import { createJourneySchema, listJourneysQuerySchema } from '@/server/validation/journeys';

export const dynamic = 'force-dynamic';

export const POST = withRoute(async (ctx) => {
  const dto = await parseBody(ctx.req, createJourneySchema);
  const journey = await createJourney(ctx.user!.sub, dto);
  return created(journey);
});

export const GET = withRoute(async (ctx) => {
  const query = parseQuery(ctx.req.nextUrl.searchParams, listJourneysQuerySchema);
  const result = await listJourneysForUser(ctx.user!.sub, query);
  return ok(result);
});
