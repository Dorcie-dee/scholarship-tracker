import { withRoute } from '@/server/lib/api-handler';
import { created, ok } from '@/server/lib/response';
import { BadRequestError } from '@/server/lib/http-errors';
import { getConfig } from '@/server/lib/config';
import { findVersionHistory, uploadNewVersion } from '@/server/services/documents.service';
import {
  documentVersionMetadataSchema,
  parseFormFields,
} from '@/server/validation/documents';

export const dynamic = 'force-dynamic';

/**
 * New version, multipart — same validation as `POST /documents`. `409` if
 * `:id` has already been superseded by a concurrent call (race-safe — see
 * `documents.service.ts`'s `uploadNewVersion()` doc comment).
 */
export const POST = withRoute<{ id: string }>(async ({ req, params, user }) => {
  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    throw new BadRequestError('A "file" field is required');
  }
  const { maxUploadBytes } = getConfig().documents;
  if (file.size > maxUploadBytes) {
    throw new BadRequestError(
      `That file is too large (max ${Math.floor(maxUploadBytes / (1024 * 1024))}MB).`,
    );
  }

  const metadata = parseFormFields(documentVersionMetadataSchema, {
    title: formData.get('title') ?? undefined,
    documentType: formData.get('documentType') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  });

  const buffer = Buffer.from(await file.arrayBuffer());
  const document = await uploadNewVersion(
    user!.sub,
    params.id,
    { buffer, filename: file.name, mimeType: file.type, size: file.size },
    metadata,
  );
  return created(document);
});

/** Full version history for this document's lineage, oldest first. */
export const GET = withRoute<{ id: string }>(async ({ params, user }) => {
  const history = await findVersionHistory(user!.sub, params.id);
  return ok(history);
});
