import { withRoute } from '@/server/lib/api-handler';
import { ok } from '@/server/lib/response';
import { getSignedDownloadUrl } from '@/server/services/documents.service';

export const dynamic = 'force-dynamic';

/** Returns `{ url, expiresInSeconds }` — a signed Cloudinary delivery URL. */
export const GET = withRoute<{ id: string }>(async ({ params, user }) => {
  const result = await getSignedDownloadUrl(params.id, user!.sub);
  return ok(result);
});
