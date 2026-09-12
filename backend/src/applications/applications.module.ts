import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Application } from './entities/application.entity';
import { ApplicationDocument } from './entities/application-document.entity';
import { ApplicationSnapshot } from './entities/application-snapshot.entity';
import { Requirement } from '../requirements/entities/requirement.entity';
import { ApplicationsService } from './applications.service';
import { ApplicationDocumentsService } from './application-documents.service';
import { ApplicationSnapshotsService } from './application-snapshots.service';
import { ApplicationPurgeService } from './application-purge.service';
import { ApplicationsController } from './applications.controller';
import { JourneysModule } from '../journeys/journeys.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { DocumentsModule } from '../documents/documents.module';
import { ProfileModule } from '../profile/profile.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Application,
      ApplicationDocument,
      ApplicationSnapshot,
      // Requirement's owning module is RequirementsModule, but that module
      // already imports ApplicationsModule (RequirementsService depends on
      // ApplicationsService) — importing RequirementsModule here would be
      // circular. Registering the repository directly, without importing the
      // module, avoids that. Used by ApplicationSnapshotsService (read-only,
      // scoped by applicationId) and, since Track 1 Group C, by
      // ApplicationsService itself (I6's Opportunity→Application requirement
      // copy — read the Opportunity's requirements, then write the copies
      // inside its own creation transaction) — neither needs
      // RequirementsService's own ownership re-check, already done here.
      Requirement,
    ]),
    JourneysModule,
    OpportunitiesModule,
    // Confirmed no reverse dependency: DocumentsModule imports neither
    // ApplicationsModule nor anything under applications/ — direct import,
    // no forwardRef() needed.
    DocumentsModule,
    // Confirmed no reverse dependency: ProfileModule/ProfileService has no
    // dependency on ApplicationsModule — direct import, no forwardRef() needed.
    ProfileModule,
  ],
  controllers: [ApplicationsController],
  providers: [
    ApplicationsService,
    ApplicationDocumentsService,
    ApplicationSnapshotsService,
    ApplicationPurgeService,
  ],
  exports: [
    ApplicationsService,
    ApplicationDocumentsService,
    ApplicationSnapshotsService,
  ],
})
export class ApplicationsModule {}
