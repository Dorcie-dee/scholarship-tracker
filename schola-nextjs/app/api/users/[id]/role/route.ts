import { withRoute } from '@/server/lib/api-handler';
import { UserRole } from '@/server/lib/enums';
import { ok } from '@/server/lib/response';
import { parseBody } from '@/server/lib/validate';
import { updateRole } from '@/server/services/users.service';
import { updateUserRoleSchema } from '@/server/validation/users';

export const dynamic = 'force-dynamic';

/**
 * ADMIN-only role promotion/demotion for another user. Cannot change your
 * own role; cannot demote the last remaining ADMIN. Never accepted on
 * `PATCH /users/me`.
 */
export const PATCH = withRoute<{ id: string }>(
  async (ctx) => {
    const { role } = await parseBody(ctx.req, updateUserRoleSchema);
    const user = await updateRole(ctx.user!.sub, ctx.params.id, role);
    return ok(user.toJSON());
  },
  { roles: [UserRole.ADMIN] },
);
