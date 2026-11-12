import { withRoute } from '@/server/lib/api-handler';
import { parseBody, parseQuery } from '@/server/lib/validate';
import { ok } from '@/server/lib/response';
import { createUniversitySchema, listUniversitiesQuerySchema } from '@/server/validation/universities';
import { createUniversity, listUniversities } from '@/server/services/universities.service';

export const dynamic = 'force-dynamic';

/** Personal workspace data — every authenticated user manages their own Universities. See `universities.service.ts`'s doc comment. */
export const GET = withRoute(async ({ req, user }) => {
  const query = parseQuery(req.nextUrl.searchParams, listUniversitiesQuerySchema);
  const result = await listUniversities(user!.sub, query);
  return ok(result);
});

/**
 * `201` only when a genuinely new University was inserted; `200` when the
 * submission matched (and reused) an existing one — a real, additive
 * signal, not a change to the resource shape. When the match reused an
 * existing row whose stored fields differ from what was just submitted,
 * `conflictingFields` names which ones — those differing values were never
 * written (see `createUniversity()`'s doc comment); this field only
 * surfaces that fact, it never triggers a merge or an overwrite.
 */
export const POST = withRoute(async ({ req, user }) => {
  const body = await parseBody(req, createUniversitySchema);
  const { university, wasCreated, conflictingFields } = await createUniversity(user!.sub, body);
  const payload = {
    ...university.toJSON(),
    ...(conflictingFields.length > 0 ? { conflictingFields } : {}),
  };
  return ok(payload, wasCreated ? 201 : 200);
});
