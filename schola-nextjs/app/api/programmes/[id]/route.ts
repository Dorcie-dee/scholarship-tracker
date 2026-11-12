import { withRoute } from '@/server/lib/api-handler';
import { parseBody } from '@/server/lib/validate';
import { noContent, ok } from '@/server/lib/response';
import { updateProgrammeSchema } from '@/server/validation/programmes';
import { deleteProgramme, getProgrammeOrThrow, updateProgramme } from '@/server/services/programmes.service';

export const dynamic = 'force-dynamic';

export const GET = withRoute<{ id: string }>(async ({ params, user }) => {
  const programme = await getProgrammeOrThrow(params.id, user!.sub);
  return ok(programme);
});

export const PATCH = withRoute<{ id: string }>(async ({ req, params, user }) => {
  const body = await parseBody(req, updateProgrammeSchema);
  const programme = await updateProgramme(params.id, user!.sub, body);
  return ok(programme);
});

export const DELETE = withRoute<{ id: string }>(async ({ params, user }) => {
  await deleteProgramme(params.id, user!.sub);
  return noContent();
});
