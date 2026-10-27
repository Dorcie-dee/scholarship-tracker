import { withRoute } from '@/server/lib/api-handler';
import { parseBody } from '@/server/lib/validate';
import { noContent, ok } from '@/server/lib/response';
import { UserRole } from '@/server/lib/enums';
import { updateProgrammeSchema } from '@/server/validation/programmes';
import { deleteProgramme, getProgrammeOrThrow, updateProgramme } from '@/server/services/programmes.service';

export const dynamic = 'force-dynamic';

export const GET = withRoute<{ id: string }>(async ({ params }) => {
  const programme = await getProgrammeOrThrow(params.id);
  return ok(programme);
});

export const PATCH = withRoute<{ id: string }>(
  async ({ req, params }) => {
    const body = await parseBody(req, updateProgrammeSchema);
    const programme = await updateProgramme(params.id, body);
    return ok(programme);
  },
  { roles: [UserRole.ADMIN] },
);

export const DELETE = withRoute<{ id: string }>(
  async ({ params }) => {
    await deleteProgramme(params.id);
    return noContent();
  },
  { roles: [UserRole.ADMIN] },
);
