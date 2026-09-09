import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Deadline } from './entities/deadline.entity';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { ApplicationsService } from '../applications/applications.service';
import { TasksService } from '../tasks/tasks.service';
import { RequirementsService } from '../requirements/requirements.service';
import { CreateDeadlineDto } from './dto/create-deadline.dto';
import { UpdateDeadlineDto } from './dto/update-deadline.dto';

/**
 * A Deadline can attach to any combination of Opportunity/Application/
 * Task/Requirement (see deadline.entity.ts). Ownership is checked through
 * whichever of Application/Task/Requirement is set — an Opportunity-only
 * deadline is shared catalog data and needs no ownership check.
 */
@Injectable()
export class DeadlinesService {
  constructor(
    @InjectRepository(Deadline)
    private readonly deadlines: Repository<Deadline>,
    private readonly opportunitiesService: OpportunitiesService,
    private readonly applicationsService: ApplicationsService,
    private readonly tasksService: TasksService,
    private readonly requirementsService: RequirementsService,
  ) {}

  /**
   * Group B / I1 fix: each of these up to four checks is independent of the
   * others' result (a different, unrelated entity each) — previously run
   * sequentially, now concurrent via Promise.all, the same pattern already
   * established for exactly this class of independent-validation-checks
   * latency fix (Track 1 Group A, Checkpoint 5). Matters more now that the
   * app talks to a remote (Neon) database than it would locally.
   */
  private async validateAndAuthorizeLinks(
    userId: string,
    dto: Partial<CreateDeadlineDto>,
  ): Promise<void> {
    await Promise.all([
      dto.opportunityId
        ? this.opportunitiesService.findOneOrThrow(dto.opportunityId)
        : Promise.resolve(undefined),
      dto.applicationId
        ? this.applicationsService.findOwnedOrThrow(dto.applicationId, userId)
        : Promise.resolve(undefined),
      dto.taskId
        ? this.tasksService.findOwnedOrThrow(dto.taskId, userId)
        : Promise.resolve(undefined),
      dto.requirementId
        ? this.requirementsService.findOneAccessible(dto.requirementId, userId)
        : Promise.resolve(undefined),
    ]);
  }

  async create(userId: string, dto: CreateDeadlineDto): Promise<Deadline> {
    if (
      !dto.opportunityId &&
      !dto.applicationId &&
      !dto.taskId &&
      !dto.requirementId
    ) {
      throw new BadRequestException(
        'A deadline must be linked to at least one of opportunityId, applicationId, taskId, requirementId',
      );
    }
    await this.validateAndAuthorizeLinks(userId, dto);
    const deadline = this.deadlines.create({
      ...dto,
      date: new Date(dto.date),
    });
    return this.deadlines.save(deadline);
  }

  async findAll(
    userId: string,
    filters: {
      opportunityId?: string;
      applicationId?: string;
      taskId?: string;
      requirementId?: string;
    },
  ): Promise<Deadline[]> {
    if (
      !filters.opportunityId &&
      !filters.applicationId &&
      !filters.taskId &&
      !filters.requirementId
    ) {
      throw new BadRequestException(
        'Provide at least one of opportunityId, applicationId, taskId, requirementId to list deadlines',
      );
    }
    await this.validateAndAuthorizeLinks(userId, filters);
    return this.deadlines.find({
      where: {
        ...(filters.opportunityId
          ? { opportunityId: filters.opportunityId }
          : {}),
        ...(filters.applicationId
          ? { applicationId: filters.applicationId }
          : {}),
        ...(filters.taskId ? { taskId: filters.taskId } : {}),
        ...(filters.requirementId
          ? { requirementId: filters.requirementId }
          : {}),
      },
      order: { date: 'ASC' },
    });
  }

  private async findEntityOrThrow(id: string): Promise<Deadline> {
    const deadline = await this.deadlines.findOne({ where: { id } });
    if (!deadline) {
      throw new NotFoundException('Deadline not found');
    }
    return deadline;
  }

  async findOneAccessible(id: string, userId: string): Promise<Deadline> {
    const deadline = await this.findEntityOrThrow(id);
    await this.validateAndAuthorizeLinks(userId, {
      applicationId: deadline.applicationId ?? undefined,
      taskId: deadline.taskId ?? undefined,
      requirementId: deadline.requirementId ?? undefined,
    });
    return deadline;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateDeadlineDto,
  ): Promise<Deadline> {
    const deadline = await this.findOneAccessible(id, userId);

    // findOneAccessible (above) already proved the deadline's CURRENT link
    // values are valid and owned by this user — only re-validate a link field
    // if the DTO is actually changing it to something new. Avoids re-checking
    // an unchanged value that was just proven valid one line above.
    const changedLinks: Partial<CreateDeadlineDto> = {};
    if (
      dto.opportunityId !== undefined &&
      dto.opportunityId !== deadline.opportunityId
    ) {
      changedLinks.opportunityId = dto.opportunityId;
    }
    if (
      dto.applicationId !== undefined &&
      dto.applicationId !== deadline.applicationId
    ) {
      changedLinks.applicationId = dto.applicationId;
    }
    if (dto.taskId !== undefined && dto.taskId !== deadline.taskId) {
      changedLinks.taskId = dto.taskId;
    }
    if (
      dto.requirementId !== undefined &&
      dto.requirementId !== deadline.requirementId
    ) {
      changedLinks.requirementId = dto.requirementId;
    }
    await this.validateAndAuthorizeLinks(userId, changedLinks);

    Object.assign(deadline, {
      ...dto,
      date: dto.date ? new Date(dto.date) : deadline.date,
    });
    return this.deadlines.save(deadline);
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOneAccessible(id, userId);
    await this.deadlines.delete(id);
  }
}
