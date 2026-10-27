import { withRoute } from '@/server/lib/api-handler';
import { created, ok } from '@/server/lib/response';
import { parseQuery } from '@/server/lib/validate';
import { BadRequestError } from '@/server/lib/http-errors';
import { getConfig } from '@/server/lib/config';
import { listCurrentDocuments, uploadNewDocument } from '@/server/services/documents.service';
import {
  documentMetadataSchema,
  listDocumentsQuerySchema,
  parseFormFields,
} from '@/server/validation/documents';

export const dynamic = 'force-dynamic';

/** Multipart upload: `file` + `title`/`documentType`/`notes` fields. Creates version 1. */
export const POST = withRoute(async ({ req, user }) => {
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

  const metadata = parseFormFields(documentMetadataSchema, {
    title: formData.get('title') ?? undefined,
    documentType: formData.get('documentType') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  });

  const buffer = Buffer.from(await file.arrayBuffer());
  const document = await uploadNewDocument(user!.sub, metadata, {
    buffer,
    filename: file.name,
    mimeType: file.type,
    size: file.size,
  });
  return created(document);
});

/** Current version of each of the user's documents, paginated. */
export const GET = withRoute(async ({ req, user }) => {
  const { cursor, limit, order } = parseQuery(req.nextUrl.searchParams, listDocumentsQuerySchema);
  const result = await listCurrentDocuments(user!.sub, { cursor, limit, order });
  return ok(result);
});
