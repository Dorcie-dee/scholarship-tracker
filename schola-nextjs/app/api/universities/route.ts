import { withRoute } from '@/server/lib/api-handler';
import { parseBody, parseQuery } from '@/server/lib/validate';
import { created, ok } from '@/server/lib/response';
import { UserRole } from '@/server/lib/enums';
import { createUniversitySchema, listUniversitiesQuerySchema } from '@/server/validation/universities';
import { createUniversity, listUniversities } from '@/server/services/universities.service';

export const dynamic = 'force-dynamic';

/** Read access is open to any authenticated user — shared catalog consumption. */
export const GET = withRoute(async ({ req }) => {
  const query = parseQuery(req.nextUrl.searchParams, listUniversitiesQuerySchema);
  const result = await listUniversities(query);
  return ok(result);
});

/** Mutation is ADMIN-only — shared catalog administration. */
export const POST = withRoute(
  async ({ req }) => {
    const body = await parseBody(req, createUniversitySchema);
    const university = await createUniversity(body);
    return created(university);
  },
  { roles: [UserRole.ADMIN] },
);
