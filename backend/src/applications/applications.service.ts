import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequirementStatus } from '../types';
import { Application } from './entities/application.entity';
import { Requirement } from '../requirements/entities/requirement.entity';
import { JourneysService } from '../journeys/journeys.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { assertOwnership } from '../common/utils/ownership';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(Application)
    private readonly applications: Repository<Application>,
    // Injected directly (not via RequirementsService) to avoid a circular
    // module dependency — RequirementsModule already imports
    // ApplicationsModule (RequirementsService depends on ApplicationsService)
    // — same reasoning already established for ApplicationSnapshotsService's
    // direct Requirement repository injection.
    @InjectRepository(Requirement)
    private readonly requirements: Repository<Requirement>,
    private readonly journeysService: JourneysService,
    private readonly opportunitiesService: OpportunitiesService,
  ) {}

  /**
   * Track 1 Group C / I6 — creates the Application and, if it's linked to an
   * Opportunity that has requirements, copies each one into a new,
   * independent Application-scoped Requirement row (never a live link — see
   * requirement.entity.ts's `copiedFromRequirementId` doc comment). A
   * one-time copy, not synchronization: later changes to the Opportunity's
   * requirements never alter what was already copied.
   *
   * The Opportunity's requirements are read BEFORE opening the transaction
   * (a plain read with no correctness dependency on the write that follows —
   * worst case, a requirement added to the Opportunity a moment after this
   * read simply isn't copied this time, which is acceptable and not a
   * correctness bug) — this keeps the transaction itself to exactly the two
   * writes that must be atomic together: the Application INSERT and the
   * bulk Requirement INSERT. If an Opportunity has zero requirements (or
   * none is supplied at all), no transaction-internal Requirement work
   * happens beyond the Application insert itself.
   */
  async create(
    userId: string,
    dto: CreateApplicationDto,
  ): Promise<Application> {
    // Independent checks — neither depends on the other's result — run
    // concurrently rather than one after another.
    const [, opportunity] = await Promise.all([
      this.journeysService.findOwnedOrThrow(dto.journeyId, userId),
      dto.opportunityId
        ? this.opportunitiesService.findOneOrThrow(dto.opportunityId)
        : Promise.resolve(undefined),
    ]);

    const opportunityRequirements = opportunity
      ? await this.requirements.find({
          where: { opportunityId: opportunity.id },
        })
      : [];

    return this.applications.manager.transaction(async (manager) => {
      const application = manager.create(Application, dto);
      const saved = await manager.save(application);

      if (opportunityRequirements.length > 0) {
        const copies = opportunityRequirements.map((source) =>
          manager.create(Requirement, {
            requirementType: source.requirementType,
            description: source.description,
            // Fresh initial status (the entity's own default), never the
            // source's current status — see this method's doc comment and
            // docs/decisions.md: a requirement's satisfaction is specific to
            // THIS application, not inherited from the catalog row.
            status: RequirementStatus.UNKNOWN,
            applicationId: saved.id,
            opportunityId: null,
            notes: source.notes,
            copiedFromRequirementId: source.id,
          }),
        );
        // One bulk save (TypeORM batches this into a small number of
        // INSERTs, not one round trip per requirement) — see
        // docs/decisions.md for the query-count reasoning.
        await manager.save(Requirement, copies);
      }

      return saved;
    });
  }

  findAllForUser(userId: string, journeyId?: string): Promise<Application[]> {
    return this.applications.find({
      where: {
        journey: { userId },
        ...(journeyId ? { journeyId } : {}),
      },
      relations: { journey: true },
      order: { createdAt: 'DESC' },
    });
  }

  private async findWithJourneyOrThrow(id: string): Promise<Application> {
    const application = await this.applications.findOne({
      where: { id },
      relations: { journey: true },
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }
    return application;
  }

  async findOwnedOrThrow(id: string, userId: string): Promise<Application> {
    const application = await this.findWithJourneyOrThrow(id);
    assertOwnership(application.journey.userId, userId);
    return application;
  }

  /** Used by other modules (requirements, tasks, deadlines) to verify ownership by applicationId only. */
  async assertApplicationOwnedByUser(
    applicationId: string,
    userId: string,
  ): Promise<void> {
    await this.findOwnedOrThrow(applicationId, userId);
  }

  /**
   * Track 1 Group C / I5 + C1.3 — journeyId is immutable after creation.
   * Tasks independently store both applicationId and journeyId (see
   * task.entity.ts); allowing an Application to move between Journeys would
   * silently desynchronize every existing Task attached to it, with nothing
   * to catch or repair the mismatch afterward. The conceptual model is: an
   * Application belongs to the Journey it was created in. A resent-but-
   * unchanged journeyId (the common case for a client that always includes
   * every field) is accepted as a no-op; an actual attempted change is
   * rejected with a clear 400, not silently ignored.
   */
  async update(
    id: string,
    userId: string,
    dto: UpdateApplicationDto,
  ): Promise<Application> {
    const application = await this.findOwnedOrThrow(id, userId);

    if (
      dto.journeyId !== undefined &&
      dto.journeyId !== application.journeyId
    ) {
      throw new BadRequestException(
        'journeyId cannot be changed after an Application is created',
      );
    }

    if (dto.opportunityId) {
      await this.opportunitiesService.findOneOrThrow(dto.opportunityId);
    }
    Object.assign(application, dto);
    return this.applications.save(application);
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOwnedOrThrow(id, userId);
    await this.applications.delete(id);
  }
}
