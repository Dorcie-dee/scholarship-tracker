import { withRoute } from '@/server/lib/api-handler';
import { parseBody } from '@/server/lib/validate';
import { noContent, ok } from '@/server/lib/response';
import { UserRole } from '@/server/lib/enums';
import { updateUniversitySchema } from '@/server/validation/universities';
import { deleteUniversity, getUniversityOrThrow, updateUniversity } from '@/server/services/universities.service';

export const dynamic = 'force-dynamic';

export const GET = withRoute<{ id: string }>(async ({ params }) => {
  const university = await getUniversityOrThrow(params.id);
  return ok(university);
});

export const PATCH = withRoute<{ id: string }>(
  async ({ req, params }) => {
    const body = await parseBody(req, updateUniversitySchema);
    const university = await updateUniversity(params.id, body);
    return ok(university);
  },
  { roles: [UserRole.ADMIN] },
);

export const DELETE = withRoute<{ id: string }>(
  async ({ params }) => {
    await deleteUniversity(params.id);
    return noContent();
  },
  { roles: [UserRole.ADMIN] },
);
