import { withRoute } from '@/server/lib/api-handler';
import { ok } from '@/server/lib/response';
import { parseBody } from '@/server/lib/validate';
import { getProfile, updateProfile } from '@/server/services/profile.service';
import { updateProfileSchema } from '@/server/validation/profile';

export const dynamic = 'force-dynamic';

export const GET = withRoute(
  async (ctx) => {
    const profile = await getProfile(ctx.user!.sub);
    return ok(profile.toJSON());
  },
  { auth: 'required' },
);

/** Partial update — a field left out of the body is untouched. */
export const PATCH = withRoute(
  async (ctx) => {
    const input = await parseBody(ctx.req, updateProfileSchema);
    const profile = await updateProfile(ctx.user!.sub, input);
    return ok(profile.toJSON());
  },
  { auth: 'required' },
);
