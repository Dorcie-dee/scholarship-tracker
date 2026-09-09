import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApplicationSnapshot } from './entities/application-snapshot.entity';
import { ApplicationDocument } from './entities/application-document.entity';
import { ApplicationsService } from './applications.service';
import { ProfileService } from '../profile/profile.service';
import { Requirement } from '../requirements/entities/requirement.entity';
import { CreateApplicationSnapshotDto } from './dto/create-application-snapshot.dto';
import { SnapshotCreatedVia } from '../types';

/**
 * Builds and retrieves immutable, point-in-time ApplicationSnapshots (spec
 * §21). See application-snapshot.entity.ts for the creation-model and
 * immutability rationale.
 *
 * Deliberately has no update()/remove() — a snapshot is create-and-read only.
 * That absence IS the immutability guarantee; it is not enforced by a comment
 * or a runtime check, consistent with how Document versioning enforces
 * "previous versions never change" elsewhere in this codebase (no update path
 * exists for a superseded Document row either).
 */
@Injectable()
export class ApplicationSnapshotsService {
  constructor(
    @InjectRepository(ApplicationSnapshot)
    private readonly applicationSnapshots: Repository<ApplicationSnapshot>,
    // Queried directly (not via ApplicationDocumentsService/RequirementsService)
    // to avoid re-running the ownership check those services already perform
    // internally — ownership is established once, up front, in create() below.
    @InjectRepository(ApplicationDocument)
    private readonly applicationDocuments: Repository<ApplicationDocument>,
    @InjectRepository(Requirement)
    private readonly requirements: Repository<Requirement>,
    private readonly applicationsService: ApplicationsService,
    private readonly profileService: ProfileService,
  ) {}

  /**
   * Creates exactly one immutable snapshot from the application's CURRENT
   * state. Always createdVia = MANUAL — this is the only creation path that
   * exists (see CreateApplicationSnapshotDto).
   *
   * Query shape: 1 ownership check (also supplies every "application facts"
   * field — no second read of the Application row) + 3 independent reads run
   * concurrently via Promise.all (attached documents, requirements, profile —
   * none depends on another's result) + 1 insert. 5 queries total, 3 of them
   * parallelized. No transaction: a single INSERT needs no atomicity beyond
   * what Postgres already guarantees for one statement, same reasoning as
   * ApplicationDocumentsService.attach().
   */
  async create(
    userId: string,
    applicationId: string,
    dto: CreateApplicationSnapshotDto,
  ): Promise<ApplicationSnapshot> {
    const application = await this.applicationsService.findOwnedOrThrow(
      applicationId,
      userId,
    );

    const [attachedDocuments, requirements, profile] = await Promise.all([
      this.applicationDocuments.find({
        where: { applicationId },
        relations: { document: true },
      }),
      this.requirements.find({ where: { applicationId } }),
      this.profileService.getByUserId(userId),
    ]);

    const data = {
      application: {
        status: application.status,
        applicationType: application.applicationType,
        title: application.title,
        startDate: application.startDate,
        submissionDate: application.submissionDate,
        portal: application.portal,
        externalUrl: application.externalUrl,
        notes: application.notes,
      },
      profile: {
        nationality: profile.nationality,
        dateOfBirth: profile.dateOfBirth,
        summary: profile.summary,
        education: profile.education,
        experience: profile.experience,
        skills: profile.skills,
        certifications: profile.certifications,
        languages: profile.languages,
      },
      requirements: requirements.map((requirement) => ({
        requirementId: requirement.id,
        requirementType: requirement.requirementType,
        description: requirement.description,
        status: requirement.status,
        notes: requirement.notes,
        // Track 1 Group D (D-P6) — a point-in-time copy of the provenance
        // breadcrumb itself (see requirement.entity.ts's doc comment on
        // Requirement.copiedFromRequirementId), never a live resolution of
        // the source row. `null` for a manually-created Application
        // Requirement; the source Opportunity Requirement's id for a Group C
        // copy. The source row is never re-read here or anywhere else after
        // this snapshot is created — its later mutation or deletion cannot
        // alter this stored value.
        copiedFromRequirementId: requirement.copiedFromRequirementId ?? null,
      })),
      // Exact historical identity only (documentId + version) — title,
      // documentType, and the file itself are NOT duplicated here; they are
      // safely re-derivable later from the immutable Document row via
      // documentId, since a Document row never changes after it's written
      // (see document.entity.ts).
      documents: attachedDocuments.map((attached) => ({
        documentId: attached.documentId,
        version: attached.document.version,
      })),
      // No storage model for written-response text exists in this codebase
      // yet (confirmed by inspection — Checkpoint 9B.0) — always empty until
      // that feature is designed separately. Not a bug; a documented gap.
      writtenResponses: [] as unknown[],
    };

    const snapshot = this.applicationSnapshots.create({
      applicationId,
      label: dto.label ?? null,
      createdVia: SnapshotCreatedVia.MANUAL,
      data,
    });

    return this.applicationSnapshots.save(snapshot);
  }

  async findAllForApplication(
    userId: string,
    applicationId: string,
  ): Promise<ApplicationSnapshot[]> {
    await this.applicationsService.findOwnedOrThrow(applicationId, userId);
    return this.applicationSnapshots.find({
      where: { applicationId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Scoped by BOTH snapshotId and applicationId in the same query — a
   * snapshot id that exists but belongs to a different (even the same user's
   * other) application 404s here rather than being returned, so a route
   * mismatch can never leak a snapshot's existence or contents.
   */
  async findOneOrThrow(
    userId: string,
    applicationId: string,
    snapshotId: string,
  ): Promise<ApplicationSnapshot> {
    await this.applicationsService.findOwnedOrThrow(applicationId, userId);
    const snapshot = await this.applicationSnapshots.findOne({
      where: { id: snapshotId, applicationId },
    });
    if (!snapshot) {
      throw new NotFoundException('Application snapshot not found');
    }
    return snapshot;
  }
}
