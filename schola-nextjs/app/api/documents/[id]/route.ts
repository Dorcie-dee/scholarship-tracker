import { withRoute } from '@/server/lib/api-handler';
import { noContent, ok } from '@/server/lib/response';
import { parseBody } from '@/server/lib/validate';
import {
  findOwnedDocumentOrThrow,
  removeDocument,
  updateDocument,
} from '@/server/services/documents.service';
import { updateDocumentSchema } from '@/server/validation/documents';

export const dynamic = 'force-dynamic';

/** Metadata only — `cloudinaryUrl` is not directly retrievable; use `:id/download-url`. */
export const GET = withRoute<{ id: string }>(async ({ params, user }) => {
  const document = await findOwnedDocumentOrThrow(params.id, user!.sub);
  return ok(document);
});

/** Metadata-only edit — upload a new version (`:id/versions`) to change the file. */
export const PATCH = withRoute<{ id: string }>(async ({ req, params, user }) => {
  const dto = await parseBody(req, updateDocumentSchema);
  const document = await updateDocument(params.id, user!.sub, dto);
  return ok(document);
});

export const DELETE = withRoute<{ id: string }>(async ({ params, user }) => {
  await removeDocument(params.id, user!.sub);
  return noContent();
});
