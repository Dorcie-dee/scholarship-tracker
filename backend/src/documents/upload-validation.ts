import { BadRequestException } from '@nestjs/common';

/**
 * Production hardening (Batch 6) — document upload security. Previously only
 * `fileSize` was enforced (Multer's `limits`); nothing checked the file's
 * actual type at all, so any file type up to the size cap could be uploaded
 * and later served back. This closes that gap with two independent checks:
 *
 * 1. The client-supplied `Content-Type` (Multer's `file.mimetype`) must be on
 *    the configured allowlist — cheap, but trivially spoofable by the client
 *    (it's just a request header), so:
 * 2. The file's actual first bytes ("magic numbers") must match a real
 *    signature for one of the allowed types. A deliberately small,
 *    hand-written signature table for exactly this app's allowlist — not a
 *    general-purpose file-type-sniffing dependency, which would be a much
 *    larger surface for what's a handful of well-known, stable signatures.
 *
 * Both must agree. A client claiming `application/pdf` while uploading an
 * executable (or vice versa) is rejected by whichever check catches it
 * first — this is deliberately NOT "trust the extension" or "trust the
 * Content-Type header" alone, both of which are entirely client-controlled.
 */

const MAGIC_BYTE_SIGNATURES: {
  mimeType: string;
  signature: (buffer: Buffer) => boolean;
}[] = [
  {
    mimeType: 'application/pdf',
    signature: (buf) => buf.subarray(0, 4).toString('latin1') === '%PDF',
  },
  {
    mimeType: 'image/jpeg',
    signature: (buf) =>
      buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  {
    mimeType: 'image/png',
    signature: (buf) =>
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47,
  },
  {
    mimeType: 'image/webp',
    signature: (buf) =>
      buf.length >= 12 &&
      buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
      buf.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  {
    // Legacy .doc (OLE Compound File) — also used by legacy .xls/.ppt, but
    // this app only accepts it as a Word document per its own allowlist.
    mimeType: 'application/msword',
    signature: (buf) =>
      buf.length >= 4 &&
      buf[0] === 0xd0 &&
      buf[1] === 0xcf &&
      buf[2] === 0x11 &&
      buf[3] === 0xe0,
  },
  {
    // .docx (and every other Office Open XML / generic zip format) — a zip
    // archive's own signature; this app's allowlist only offers this for
    // the one OOXML MIME type it accepts.
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    signature: (buf) =>
      buf.length >= 4 &&
      buf[0] === 0x50 &&
      buf[1] === 0x4b &&
      (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07),
  },
];

function matchesKnownSignature(buffer: Buffer, mimeType: string): boolean {
  const entry = MAGIC_BYTE_SIGNATURES.find((s) => s.mimeType === mimeType);
  return entry ? entry.signature(buffer) : false;
}

export function validateUploadedFile(
  file: Express.Multer.File,
  allowedMimeTypes: string[],
): void {
  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw new BadRequestException(
      `Unsupported file type "${file.mimetype}". Allowed types: ${allowedMimeTypes.join(', ')}`,
    );
  }
  if (!matchesKnownSignature(file.buffer, file.mimetype)) {
    throw new BadRequestException(
      "The uploaded file's content does not match its declared type — the file may be corrupted, mislabeled, or not a genuine file of that type.",
    );
  }
}
