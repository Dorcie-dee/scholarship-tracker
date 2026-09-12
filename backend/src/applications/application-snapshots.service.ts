import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ApplicationSnapshot } from './entities/application-snapshot.entity';
import { ApplicationDocument } from './entities/application-document.entity';
import { ApplicationsService } from './applications.service';
import { ProfileService } from '../profile/profile.service';
import { Requirement } from '../requirements/entities/requirement.entity';
import { CreateApplicationSnapshotDto } from './dto/create-application-snapshot.dto';
import { EditApplicationSnapshotDto } from './dto/edit-application-snapshot.dto';
import { SnapshotCreatedVia } from '../types';

/**
 * ApplicationSnapshots — create, read, append-only edit (new revision), delete.
 * Historical rows are never mutated in place.
 */
@Injectable()
export class ApplicationSnapshotsService {
  constructor(
    @InjectRepository(ApplicationSnapshot)
    private readonly applicationSnapshots: Repository<ApplicationSnapshot>,
    @InjectRepository(ApplicationDocument)
    private readonly applicationDocuments: Repository<ApplicationDocument>,
    @InjectRepository(Requirement)
    private readonly requirements: Repository<Requirement>,
    private readonly applicationsService: ApplicationsService,
    private readonly profileService: ProfileService,
    private readonly dataSource: DataSource,
  ) {}

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
        copiedFromRequirementId: requirement.copiedFromRequirementId ?? null,
      })),
      documents: attachedDocuments.map((attached) => ({
        documentId: attached.documentId,
        version: attached.document.version,
      })),
      writtenResponses: [] as unknown[],
    };

    const snapshot = this.applicationSnapshots.create({
      applicationId,
      label: dto.label ?? null,
      createdVia: SnapshotCreatedVia.MANUAL,
      data,
      supersedesSnapshotId: null,
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

  /**
   * Append-only edit: inserts a new snapshot that supersedes `snapshotId`.
   * The previous row is never mutated. Uses a transaction + row lock on the
   * source revision so concurrent edits serialize cleanly.
   */
  async edit(
    userId: string,
    applicationId: string,
    snapshotId: string,
    dto: EditApplicationSnapshotDto,
  ): Promise<ApplicationSnapshot> {
    await this.applicationsService.findOwnedOrThrow(applicationId, userId);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ApplicationSnapshot);
      const previous = await repo.findOne({
        where: { id: snapshotId, applicationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!previous) {
        throw new NotFoundException('Application snapshot not found');
      }

      const revision = repo.create({
        applicationId,
        label: dto.label !== undefined ? dto.label : previous.label,
        createdVia: SnapshotCreatedVia.MANUAL,
        data: dto.data !== undefined ? dto.data : previous.data,
        supersedesSnapshotId: previous.id,
      });
      return repo.save(revision);
    });
  }

  /**
   * Hard-delete a snapshot owned by the user's application. Lineage FKs from
   * newer revisions use ON DELETE SET NULL, so deleting a mid-chain revision
   * clears the pointer rather than cascading.
   */
  async remove(
    userId: string,
    applicationId: string,
    snapshotId: string,
  ): Promise<void> {
    await this.applicationsService.findOwnedOrThrow(applicationId, userId);

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ApplicationSnapshot);
      const snapshot = await repo.findOne({
        where: { id: snapshotId, applicationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!snapshot) {
        throw new NotFoundException('Application snapshot not found');
      }
      await repo.delete({ id: snapshot.id, applicationId });
    });
  }
}
