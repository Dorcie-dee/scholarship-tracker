import { withRoute } from '@/server/lib/api-handler';
import { UserRole } from '@/server/lib/enums';
import { ok } from '@/server/lib/response';
import { parseQuery } from '@/server/lib/validate';
import { listDirectory } from '@/server/services/users.service';
import { listUsersQuerySchema } from '@/server/validation/users';

export const dynamic = 'force-dynamic';

/** ADMIN-only user directory — keyset-paginated, searchable. */
export const GET = withRoute(
  async (ctx) => {
    const query = parseQuery(ctx.req.nextUrl.searchParams, listUsersQuerySchema);
    const page = await listDirectory(query);
    return ok(page);
  },
  { roles: [UserRole.ADMIN] },
);
