import { withRoute } from '@/server/lib/api-handler';
import { noContent, ok } from '@/server/lib/response';
import { parseBody } from '@/server/lib/validate';
import { deleteJourney, getJourneyOwnedOrThrow, updateJourney } from '@/server/services/journeys.service';
import { updateJourneySchema } from '@/server/validation/journeys';

export const dynamic = 'force-dynamic';

export const GET = withRoute<{ id: string }>(async (ctx) => {
  const journey = await getJourneyOwnedOrThrow(ctx.params.id, ctx.user!.sub);
  return ok(journey);
});

export const PATCH = withRoute<{ id: string }>(async (ctx) => {
  const dto = await parseBody(ctx.req, updateJourneySchema);
  const journey = await updateJourney(ctx.params.id, ctx.user!.sub, dto);
  return ok(journey);
});

export const DELETE = withRoute<{ id: string }>(async (ctx) => {
  await deleteJourney(ctx.params.id, ctx.user!.sub);
  return noContent();
});
