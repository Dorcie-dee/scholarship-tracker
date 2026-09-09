import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';
import { AppConfig } from '../../config/configuration';

export interface UploadedFileResult {
  publicId: string;
  url: string;
  secureUrl: string;
  bytes: number;
  format: string;
  resourceType: string;
}

/**
 * Thin abstraction over the Cloudinary SDK. Nothing outside this service should
 * import `cloudinary` directly (spec §24) — that keeps a future storage-backend
 * swap to a single file.
 *
 * V1 scope: upload + delete only. Document metadata (type, version, ownership)
 * lives in the `documents` module's own entity, not here.
 */
@Injectable()
export class CloudinaryService implements OnModuleInit {
  private readonly logger = new Logger(CloudinaryService.name);
  private configured = false;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  onModuleInit(): void {
    const { cloudName, apiKey, apiSecret } = this.configService.get(
      'cloudinary',
      { infer: true },
    );

    if (!cloudName || !apiKey || !apiSecret) {
      this.logger.warn(
        'Cloudinary is not configured (CLOUDINARY_* env vars missing) — document uploads will fail until it is.',
      );
      return;
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    this.configured = true;
  }

  isConfigured(): boolean {
    return this.configured;
  }

  /**
   * Uploads a buffer (e.g. from a Multer memory-storage file) to Cloudinary under
   * a folder scoped to the owning user, so files are trivially attributable and
   * listable per-user in the Cloudinary console.
   */
  async uploadBuffer(
    buffer: Buffer,
    options: { folder: string; filename?: string },
  ): Promise<UploadedFileResult> {
    if (!this.configured) {
      throw new Error(
        'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET.',
      );
    }

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: options.folder,
          resource_type: 'auto',
          filename_override: options.filename,
          use_filename: Boolean(options.filename),
          unique_filename: true,
        },
        (error, result) => {
          if (error || !result) {
            reject(
              new Error(
                error?.message ?? 'Cloudinary upload returned no result',
              ),
            );
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

  async deleteByPublicId(publicId: string): Promise<void> {
    if (!this.configured) {
      return;
    }
    await cloudinary.uploader.destroy(publicId, { resource_type: 'auto' });
  }
}
