import { withRoute } from '@/server/lib/api-handler';
import { parseBody, parseQuery } from '@/server/lib/validate';
import { ok } from '@/server/lib/response';
import { createProgrammeSchema, listProgrammesQuerySchema } from '@/server/validation/programmes';
import { createProgramme, listProgrammes } from '@/server/services/programmes.service';

export const dynamic = 'force-dynamic';

/** Personal workspace data — same owner-scoped shape as /universities. See `programmes.service.ts`'s doc comment. */
export const GET = withRoute(async ({ req, user }) => {
  const query = parseQuery(req.nextUrl.searchParams, listProgrammesQuerySchema);
  const result = await listProgrammes(user!.sub, query);
  return ok(result);
});

/** Same `201`-vs-`200`/`conflictingFields` convention as `POST /universities` — see that route's doc comment. */
export const POST = withRoute(async ({ req, user }) => {
  const body = await parseBody(req, createProgrammeSchema);
  const { programme, wasCreated, conflictingFields } = await createProgramme(user!.sub, body);
  const payload = {
    ...programme.toJSON(),
    ...(conflictingFields.length > 0 ? { conflictingFields } : {}),
  };
  return ok(payload, wasCreated ? 201 : 200);
});
