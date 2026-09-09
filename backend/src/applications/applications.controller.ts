import {
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
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { ApplicationsService } from './applications.service';
import { ApplicationDocumentsService } from './application-documents.service';
import { ApplicationSnapshotsService } from './application-snapshots.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { AttachDocumentDto } from './dto/attach-document.dto';
import { CreateApplicationSnapshotDto } from './dto/create-application-snapshot.dto';

@Controller('applications')
export class ApplicationsController {
  constructor(
    private readonly applicationsService: ApplicationsService,
    private readonly applicationDocumentsService: ApplicationDocumentsService,
    private readonly applicationSnapshotsService: ApplicationSnapshotsService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApplicationDto,
  ) {
    return this.applicationsService.create(user.userId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('journeyId') journeyId?: string,
  ) {
    return this.applicationsService.findAllForUser(user.userId, journeyId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.applicationsService.findOwnedOrThrow(id, user.userId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.applicationsService.update(id, user.userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.applicationsService.remove(id, user.userId);
  }

  // Ownership (of both the application and the document) is enforced entirely
  // by ApplicationDocumentsService — this controller only extracts the
  // authenticated user id and route param and passes them through unchanged.
  @Post(':id/documents')
  attachDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AttachDocumentDto,
  ) {
    return this.applicationDocumentsService.attach(user.userId, id, dto);
  }

  @Get(':id/documents')
  findAttachedDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.applicationDocumentsService.findAllForApplication(
      user.userId,
      id,
    );
  }

  // Working-state cleanup only — removes the attachment (join row), never
  // the underlying Document, never the Cloudinary asset, never an existing
  // snapshot. See ApplicationDocumentsService.detach()'s doc comment.
  @Delete(':id/documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async detachDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    await this.applicationDocumentsService.detach(user.userId, id, documentId);
  }

  // Ownership is enforced entirely by ApplicationSnapshotsService — this
  // controller only extracts the authenticated user id and route params and
  // passes them through unchanged. createdVia is never accepted from the
  // client (see CreateApplicationSnapshotDto) — the service always sets it.
  @Post(':id/snapshots')
  createSnapshot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateApplicationSnapshotDto,
  ) {
    return this.applicationSnapshotsService.create(user.userId, id, dto);
  }

  @Get(':id/snapshots')
  findSnapshots(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.applicationSnapshotsService.findAllForApplication(
      user.userId,
      id,
    );
  }

  @Get(':id/snapshots/:snapshotId')
  findSnapshot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    return this.applicationSnapshotsService.findOneOrThrow(
      user.userId,
      id,
      snapshotId,
    );
  }
}
