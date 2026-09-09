import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from './entities/document.entity';
import { ApplicationDocument } from '../applications/entities/application-document.entity';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { CloudinaryModule } from '../common/cloudinary/cloudinary.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Document,
      // ApplicationDocument's owning module is ApplicationsModule, but that
      // module already imports DocumentsModule (ApplicationDocumentsService
      // depends on DocumentsService) — importing ApplicationsModule here
      // would be circular. Registering this repository directly, without
      // importing the module, avoids that — same pattern already
      // established for ApplicationSnapshotsService's direct Requirement
      // injection and ApplicationsService's direct Requirement injection.
      // Used by DocumentsService (Track 1 Group D) only to check whether a
      // Document version is currently attached before allowing its
      // deletion. (No ApplicationSnapshot repository registration is needed
      // here — that check goes through a raw cross-table query instead;
      // see DocumentsService.isReferencedInAnySnapshot()'s doc comment.)
      ApplicationDocument,
    ]),
    CloudinaryModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
