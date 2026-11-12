import { withRoute } from '@/server/lib/api-handler';
import { noContent, ok } from '@/server/lib/response';
import { parseBody } from '@/server/lib/validate';
import { eraseAccount, getByIdOrThrow, updateMe } from '@/server/services/users.service';
import { updateUserSchema } from '@/server/validation/users';

export const dynamic = 'force-dynamic';

/** Full user record — password hash always stripped (`select: false` on the model). */
export const GET = withRoute(async (ctx) => {
  const user = await getByIdOrThrow(ctx.user!.sub);
  return ok(user.toJSON());
});

/** Update `name` only — never accepts `role` (rejected outright by the `.strict()` schema). */
export const PATCH = withRoute(async (ctx) => {
  const input = await parseBody(ctx.req, updateUserSchema);
  const user = await updateMe(ctx.user!.sub, input);
  return ok(user.toJSON());
});

/** Full account erasure — irreversible, immediate, not soft-deleted. */
export const DELETE = withRoute(async (ctx) => {
  await eraseAccount(ctx.user!.sub);
  return noContent();
});
