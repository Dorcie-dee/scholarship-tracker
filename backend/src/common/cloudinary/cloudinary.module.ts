import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CloudinaryService } from './cloudinary.service';

/**
 * Wraps the Cloudinary SDK behind a single injectable service so upload/storage
 * logic never leaks into controllers directly (spec §24). If we ever swap or
 * add a storage backend, only this module/service changes.
 */
@Module({
  imports: [ConfigModule],
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class CloudinaryModule {}
