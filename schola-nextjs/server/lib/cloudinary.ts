import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { Readable } from 'node:stream';
import { getConfig } from './config';

/**
 * Thin abstraction over the Cloudinary SDK — ported from the NestJS
 * backend's `common/cloudinary/cloudinary.service.ts`. Nothing outside this
 * file should import `cloudinary` directly.
 */

export interface UploadedFileResult {
  publicId: string;
  url: string;
  secureUrl: string;
  bytes: number;
  format: string;
  resourceType: string;
}

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const { cloudName, apiKey, apiSecret } = getConfig().cloudinary;
  if (!cloudName || !apiKey || !apiSecret) return false;
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  configured = true;
  return true;
}

export function isCloudinaryConfigured(): boolean {
  return ensureConfigured();
}

/**
 * Uploads a buffer to Cloudinary under a folder scoped to the owning user.
 * `type: 'authenticated'` — the asset is NOT retrievable via a plain URL;
 * every access requires a signature Cloudinary itself verifies (see
 * `getSignedDeliveryUrl()`). Necessary given this app's `DocumentType` enum
 * covers identity-adjacent personal documents (passport copies, transcripts).
 */
export async function uploadBuffer(
  buffer: Buffer,
  options: { folder: string; filename?: string },
): Promise<UploadedFileResult> {
  if (!ensureConfigured()) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET.');
  }

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        resource_type: 'auto',
        type: 'authenticated',
        filename_override: options.filename,
        use_filename: Boolean(options.filename),
        unique_filename: true,
      },
      (error, result) => {
        if (error || !result) {
          reject(new Error(error?.message ?? 'Cloudinary upload returned no result'));
          return;
        }
        resolve(result);
      },
    );
    Readable.from(buffer).pipe(uploadStream);
  });

  return {
    publicId: result.public_id,
    url: result.url,
    secureUrl: result.secure_url,
    bytes: result.bytes,
    format: result.format,
    resourceType: result.resource_type,
  };
}

/**
 * Honest scope: signed, not time-expiring — see the original backend's
 * `cloudinary.service.ts` doc comment ("Document delivery: signed URLs, not
 * yet time-expiring"). True server-enforced expiry needs Cloudinary's
 * `auth_token` add-on, a separate opt-in feature this app has no way to
 * detect/configure. `ttlSeconds` (the caller's intended window) is
 * communicated to the client but not enforced here.
 */
export function getSignedDeliveryUrl(
  publicId: string,
  resourceType: 'image' | 'raw' | 'video',
): string {
  if (!ensureConfigured()) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET.');
  }
  return cloudinary.url(publicId, {
    type: 'authenticated',
    resource_type: resourceType,
    sign_url: true,
    secure: true,
  });
}

export async function deleteByPublicId(
  publicId: string,
  resourceType: 'image' | 'raw' | 'video' = 'image',
): Promise<void> {
  if (!ensureConfigured()) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: 'authenticated' });
}
