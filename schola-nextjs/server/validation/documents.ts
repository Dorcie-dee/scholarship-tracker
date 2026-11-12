import { z } from 'zod';
import { DocumentType } from '../lib/enums';
import { BadRequestError } from '../lib/http-errors';
import { paginationQueryFields } from './common';

/**
 * Document metadata accompanies a multipart upload (see
 * `documents/dto/create-document.dto.ts`) — the file itself arrives via
 * `request.formData()`, not JSON, so these fields are parsed from the
 * `FormData` entries directly rather than through `parseBody()`.
 */
export const documentMetadataSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    documentType: z.nativeEnum(DocumentType).optional(),
    notes: z.string().optional(),
  })
  .strict();

export type DocumentMetadataInput = z.infer<typeof documentMetadataSchema>;

/** `POST /documents/:id/versions` — every metadata field is optional (falls back to the previous version's). */
export const documentVersionMetadataSchema = documentMetadataSchema.partial().strict();

export type DocumentVersionMetadataInput = z.infer<typeof documentVersionMetadataSchema>;

/** `PATCH /documents/:id` — metadata-only edit; the file content never changes here. */
export const updateDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    notes: z.string().optional(),
  })
  .strict();

export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

export const listDocumentsQuerySchema = z
  .object({
    order: z.enum(['asc', 'desc']).optional(),
    ...paginationQueryFields,
  })
  .strict();

export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

/**
 * `parseBody()`/`parseQuery()` (`server/lib/validate.ts`) only cover JSON
 * bodies and `URLSearchParams` — a multipart upload's metadata fields arrive
 * as `FormData` entries instead, so this mirrors their error-formatting
 * convention for that third shape.
 */
export function parseFormFields<T>(schema: z.ZodSchema<T>, raw: Record<string, unknown>): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(body)'}: ${issue.message}`)
      .join('; ');
    throw new BadRequestError(message);
  }
  return result.data;
}

/**
 * Ported from `documents/upload-validation.ts` (Production hardening Batch
 * 6) — two independent checks: the client-supplied MIME type must be
 * allowlisted, AND the file's actual first bytes ("magic numbers") must
 * match a real signature for that declared type. Both must agree; neither
 * "trust the Content-Type header" nor "trust the extension" alone is
 * sufficient, since both are entirely client-controlled.
 */
const MAGIC_BYTE_SIGNATURES: { mimeType: string; signature: (buffer: Buffer) => boolean }[] = [
  {
    mimeType: 'application/pdf',
    signature: (buf) => buf.subarray(0, 4).toString('latin1') === '%PDF',
  },
  {
    mimeType: 'image/jpeg',
    signature: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  {
    mimeType: 'image/png',
    signature: (buf) =>
      buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47,
  },
  {
    mimeType: 'image/webp',
    signature: (buf) =>
      buf.length >= 12 &&
      buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
      buf.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  {
    // Legacy .doc (OLE Compound File).
    mimeType: 'application/msword',
    signature: (buf) =>
      buf.length >= 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0,
  },
  {
    // .docx — a zip archive's own signature.
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    signature: (buf) =>
      buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07),
  },
];

function matchesKnownSignature(buffer: Buffer, mimeType: string): boolean {
  const entry = MAGIC_BYTE_SIGNATURES.find((s) => s.mimeType === mimeType);
  return entry ? entry.signature(buffer) : false;
}

export function validateUploadedFile(
  buffer: Buffer,
  mimeType: string,
  allowedMimeTypes: string[],
): void {
  if (!allowedMimeTypes.includes(mimeType)) {
    throw new BadRequestError(
      `Unsupported file type "${mimeType}". Allowed types: ${allowedMimeTypes.join(', ')}`,
    );
  }
  if (!matchesKnownSignature(buffer, mimeType)) {
    throw new BadRequestError(
      "The uploaded file's content does not match its declared type — the file may be corrupted, mislabeled, or not a genuine file of that type.",
    );
  }
}
