import { withRoute } from '@/server/lib/api-handler';
import { noContent, ok } from '@/server/lib/response';
import { parseBody } from '@/server/lib/validate';
import {
  getApplicationForViewOwnedOrThrow,
  softDeleteApplication,
  updateApplication,
} from '@/server/services/applications.service';
import { updateApplicationSchema } from '@/server/validation/applications';

export const dynamic = 'force-dynamic';

/**
 * Deliberately uses `getApplicationForViewOwnedOrThrow`, not
 * `getApplicationOwnedOrThrow` — a soft-deleted application must still be
 * viewable (with `deletedAt` set) by its owner so the frontend can offer a
 * restore action, rather than 404ing indistinguishably from "never existed."
 */
export const GET = withRoute<{ id: string }>(async (ctx) => {
  const application = await getApplicationForViewOwnedOrThrow(ctx.params.id, ctx.user!.sub);
  return ok(application);
});

export const PATCH = withRoute<{ id: string }>(async (ctx) => {
  const dto = await parseBody(ctx.req, updateApplicationSchema);
  const application = await updateApplication(ctx.params.id, ctx.user!.sub, dto);
  return ok(application);
});

/** Soft delete (Production hardening Batch 7) — see `applications.service.ts`. */
export const DELETE = withRoute<{ id: string }>(async (ctx) => {
  await softDeleteApplication(ctx.params.id, ctx.user!.sub);
  return noContent();
});
