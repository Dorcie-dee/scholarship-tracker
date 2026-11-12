import { withRoute } from '@/server/lib/api-handler';
import { parseBody } from '@/server/lib/validate';
import { noContent, ok } from '@/server/lib/response';
import { updateUniversitySchema } from '@/server/validation/universities';
import { deleteUniversity, getUniversityOrThrow, updateUniversity } from '@/server/services/universities.service';

export const dynamic = 'force-dynamic';

export const GET = withRoute<{ id: string }>(async ({ params, user }) => {
  const university = await getUniversityOrThrow(params.id, user!.sub);
  return ok(university);
});

export const PATCH = withRoute<{ id: string }>(async ({ req, params, user }) => {
  const body = await parseBody(req, updateUniversitySchema);
  const university = await updateUniversity(params.id, user!.sub, body);
  return ok(university);
});

export const DELETE = withRoute<{ id: string }>(async ({ params, user }) => {
  await deleteUniversity(params.id, user!.sub);
  return noContent();
});
