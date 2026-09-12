import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { AppConfig } from '../config/configuration';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { validateUploadedFile } from './upload-validation';

/**
 * Read directly from `process.env` (not `ConfigService`) — a narrow,
 * documented exception to this project's "all config goes through
 * configuration.ts" convention: `@UseInterceptors(FileInterceptor(...))`'s
 * arguments are evaluated at class-decoration time, before Nest's DI
 * container exists, so an injected `ConfigService` value can't reach this
 * particular spot. Matches `configuration.ts`'s own default exactly.
 */
const MAX_UPLOAD_BYTES = Number(
  process.env.DOCUMENT_MAX_UPLOAD_BYTES ?? 20 * 1024 * 1024,
);

@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  private assertValidUpload(file?: Express.Multer.File): asserts file {
    if (!file) {
      throw new BadRequestException(
        'A file is required (multipart field "file")',
      );
    }
    // Production hardening (Batch 6) — MIME allowlist + magic-byte content
    // check; see upload-validation.ts's doc comment. Multer's own
    // `limits.fileSize` (set per-route below) already rejected an
    // oversized file before this handler even runs.
    validateUploadedFile(
      file,
      this.configService.get('documents', { infer: true }).allowedMimeTypes,
    );
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    this.assertValidUpload(file);
    return this.documentsService.uploadNew(user.userId, dto, file);
  }

  @Post(':id/versions')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  uploadVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: Partial<CreateDocumentDto>,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    this.assertValidUpload(file);
    return this.documentsService.uploadNewVersion(user.userId, id, file, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.documentsService.findAllCurrentForUser(user.userId, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentsService.findOwnedOrThrow(id, user.userId);
  }

  /**
   * Production hardening (Batch 6) — the document's own `cloudinaryUrl`
   * field is no longer directly retrievable (uploads are now Cloudinary
   * `type: 'authenticated'`); a client must call this endpoint to get a
   * signed, short-lived delivery URL instead. Ownership-checked exactly
   * like `GET /documents/:id`.
   */
  @Get(':id/download-url')
  getSignedDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.documentsService.getSignedDownloadUrl(id, user.userId);
  }

  @Get(':id/versions')
  versionHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.documentsService.findVersionHistory(user.userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentsService.update(id, user.userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.documentsService.remove(id, user.userId);
  }
}
