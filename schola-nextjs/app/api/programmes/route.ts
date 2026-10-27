import { withRoute } from '@/server/lib/api-handler';
import { parseBody, parseQuery } from '@/server/lib/validate';
import { created, ok } from '@/server/lib/response';
import { UserRole } from '@/server/lib/enums';
import { createProgrammeSchema, listProgrammesQuerySchema } from '@/server/validation/programmes';
import { createProgramme, listProgrammes } from '@/server/services/programmes.service';

export const dynamic = 'force-dynamic';

/** Same read-open/mutation-ADMIN-only split as /universities — see that route's doc comment. */
export const GET = withRoute(async ({ req }) => {
  const query = parseQuery(req.nextUrl.searchParams, listProgrammesQuerySchema);
  const result = await listProgrammes(query);
  return ok(result);
});

export const POST = withRoute(
  async ({ req }) => {
    const body = await parseBody(req, createProgrammeSchema);
    const programme = await createProgramme(body);
    return created(programme);
  },
  { roles: [UserRole.ADMIN] },
);
