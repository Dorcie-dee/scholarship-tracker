import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskDependencyType, TaskStatus } from '../types';
import { Task } from './entities/task.entity';
import { JourneysService } from '../journeys/journeys.service';
import { ApplicationsService } from '../applications/applications.service';
import { RequirementsService } from '../requirements/requirements.service';
import { assertOwnership } from '../common/utils/ownership';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

/**
 * Tasks are always owned via their journeyId (see task.entity.ts) — this is
 * what makes ownership checks possible without joining through Application
 * for tasks that aren't attached to one.
 *
 * `dependsOnTaskId`/`dependencyType` are validated for referential integrity
 * AND scope consistency (Track 1 Group C, C2) but are NEVER used to block a
 * status change — see task.entity.ts's doc comment and tasks.service.spec.ts.
 */
@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly tasks: Repository<Task>,
    private readonly journeysService: JourneysService,
    private readonly applicationsService: ApplicationsService,
    private readonly requirementsService: RequirementsService,
  ) {}

  /**
   * Group C / C2.1 + C2.2 — a dependency target must be a real task owned by
   * the same user (already validated by the caller via findOwnedOrThrow
   * before this runs) AND must stay within the same workflow scope:
   *  - an application-scoped dependent task may only depend on a task
   *    belonging to the SAME application;
   *  - a journey-level dependent task (no applicationId) may only depend on
   *    another journey-level task in the SAME journey.
   * `dependentTaskId` is undefined on create() (the row has no id yet, so
   * self-dependency is structurally impossible there) and the task's own id
   * on update() (C2.1's self-dependency guard).
   */
  private validateDependencyScope(
    dependentTaskId: string | undefined,
    effectiveApplicationId: string | null,
    effectiveJourneyId: string,
    target: Task,
  ): void {
    if (dependentTaskId && target.id === dependentTaskId) {
      throw new BadRequestException('A task cannot depend on itself');
    }
    if (effectiveApplicationId) {
      if (target.applicationId !== effectiveApplicationId) {
        throw new BadRequestException(
          'dependsOnTaskId must reference a task belonging to the same Application',
        );
      }
      return;
    }
    if (target.applicationId) {
      throw new BadRequestException(
        'A journey-level task cannot depend on an application-scoped task',
      );
    }
    if (target.journeyId !== effectiveJourneyId) {
      throw new BadRequestException(
        'dependsOnTaskId must reference a task belonging to the same Journey',
      );
    }
  }

  async create(userId: string, dto: CreateTaskDto): Promise<Task> {
    // Group C / C2.4 — a dependency TYPE with no dependency TARGET is a
    // nonsensical state; reject it before doing any DB work.
    if (dto.dependencyType && !dto.dependsOnTaskId) {
      throw new BadRequestException(
        'dependencyType requires a dependsOnTaskId',
      );
    }

    // Independent checks — none depends on another's result to decide
    // whether/how to run — execute concurrently rather than one after
    // another. The application/journey cross-check and the dependency
    // scope check below only need values already known (dto.journeyId,
    // dto.applicationId) plus these checks' own results.
    const [, application, , dependencyTarget] = await Promise.all([
      this.journeysService.findOwnedOrThrow(dto.journeyId, userId),
      dto.applicationId
        ? this.applicationsService.findOwnedOrThrow(dto.applicationId, userId)
        : Promise.resolve(undefined),
      dto.requirementId
        ? this.requirementsService.findOneAccessible(dto.requirementId, userId)
        : Promise.resolve(undefined),
      dto.dependsOnTaskId
        ? this.findOwnedOrThrow(dto.dependsOnTaskId, userId)
        : Promise.resolve(undefined),
    ]);

    if (application && application.journeyId !== dto.journeyId) {
      throw new BadRequestException(
        'applicationId does not belong to the given journeyId',
      );
    }

    if (dependencyTarget) {
      this.validateDependencyScope(
        undefined,
        dto.applicationId ?? null,
        dto.journeyId,
        dependencyTarget,
      );
    }

    const task = this.tasks.create({
      ...dto,
      dependencyType: dto.dependsOnTaskId
        ? (dto.dependencyType ?? TaskDependencyType.SOFT)
        : null,
    });
    return this.tasks.save(task);
  }

  findAllForUser(
    userId: string,
    filters: { journeyId?: string; applicationId?: string },
  ): Promise<Task[]> {
    return this.tasks.find({
      where: {
        journey: { userId },
        ...(filters.journeyId ? { journeyId: filters.journeyId } : {}),
        ...(filters.applicationId
          ? { applicationId: filters.applicationId }
          : {}),
      },
      relations: { journey: true },
      order: { dueDate: 'ASC' },
    });
  }

  private async findWithJourneyOrThrow(id: string): Promise<Task> {
    const task = await this.tasks.findOne({
      where: { id },
      relations: { journey: true },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  async findOwnedOrThrow(id: string, userId: string): Promise<Task> {
    const task = await this.findWithJourneyOrThrow(id);
    assertOwnership(task.journey.userId, userId);
    return task;
  }

  /**
   * Group C / C1.2 + C2 — the create() path validates journeyId/applicationId
   * consistency and dependency scope; update() previously validated neither
   * when either field changed. Both are now derived as "effective" values
   * (the incoming change if provided, otherwise the task's current value) and
   * validated the same way create() does — the same pattern already
   * established for Group B's Opportunity university/programme consistency
   * fix. Because Application.journeyId is now immutable (C1.3), an
   * application's journeyId can never itself be mid-change here, which is
   * what makes fetching it via a single ownership check sufficient (no
   * "which of two simultaneously-changing values is authoritative" ambiguity
   * to resolve).
   */
  async update(id: string, userId: string, dto: UpdateTaskDto): Promise<Task> {
    const task = await this.findOwnedOrThrow(id, userId);

    const journeyIdChanging =
      dto.journeyId !== undefined && dto.journeyId !== task.journeyId;
    const applicationIdChanging =
      dto.applicationId !== undefined &&
      dto.applicationId !== task.applicationId;

    const effectiveJourneyId = journeyIdChanging
      ? (dto.journeyId as string)
      : task.journeyId;
    const effectiveApplicationId = applicationIdChanging
      ? (dto.applicationId as string)
      : task.applicationId;

    // The application record is needed whenever it's changing (to validate
    // it), OR whenever it's simply in effect alongside a changing journeyId
    // (to re-check consistency against the new journey) — never fetched
    // twice for the same call.
    const needsApplicationRecord =
      applicationIdChanging ||
      (Boolean(effectiveApplicationId) && journeyIdChanging);

    // dependsOnTaskId: undefined = unchanged, null = explicit clear (C2.3),
    // a string = a new target to validate.
    const dependsOnTaskIdProvided = dto.dependsOnTaskId !== undefined;
    const clearingDependency =
      dependsOnTaskIdProvided && dto.dependsOnTaskId === null;
    const settingNewDependency =
      dependsOnTaskIdProvided && dto.dependsOnTaskId !== null;

    if (settingNewDependency && dto.dependsOnTaskId === id) {
      // Cheap, immediate rejection — no need to even look the row up.
      throw new BadRequestException('A task cannot depend on itself');
    }

    const [, applicationRecord, , dependencyTarget] = await Promise.all([
      journeyIdChanging
        ? this.journeysService.findOwnedOrThrow(dto.journeyId as string, userId)
        : Promise.resolve(undefined),
      needsApplicationRecord
        ? this.applicationsService.findOwnedOrThrow(
            effectiveApplicationId as string,
            userId,
          )
        : Promise.resolve(undefined),
      dto.requirementId
        ? this.requirementsService.findOneAccessible(dto.requirementId, userId)
        : Promise.resolve(undefined),
      settingNewDependency
        ? this.findOwnedOrThrow(dto.dependsOnTaskId as string, userId)
        : Promise.resolve(undefined),
    ]);

    if (
      applicationRecord &&
      applicationRecord.journeyId !== effectiveJourneyId
    ) {
      throw new BadRequestException(
        'applicationId does not belong to the given journeyId',
      );
    }

    if (dependencyTarget) {
      this.validateDependencyScope(
        id,
        effectiveApplicationId,
        effectiveJourneyId,
        dependencyTarget,
      );
    }

    // Group C / C2.3 + C2.4 — resolve the final dependsOnTaskId/dependencyType
    // pair explicitly, rather than trusting Object.assign to reconcile them:
    // clearing the dependency always clears its type too (never leaving
    // dependsOnTaskId=null with a stale dependencyType), and a type can never
    // end up set without a target.
    const effectiveDependsOnTaskId = clearingDependency
      ? null
      : settingNewDependency
        ? (dto.dependsOnTaskId as string)
        : task.dependsOnTaskId;

    let nextDependencyType: TaskDependencyType | null;
    if (clearingDependency) {
      nextDependencyType = null;
    } else if (dto.dependencyType !== undefined) {
      nextDependencyType = dto.dependencyType;
    } else if (settingNewDependency) {
      nextDependencyType = TaskDependencyType.SOFT; // same default as create()
    } else {
      nextDependencyType = task.dependencyType;
    }

    if (nextDependencyType && !effectiveDependsOnTaskId) {
      throw new BadRequestException(
        'dependencyType requires a dependsOnTaskId',
      );
    }

    Object.assign(task, dto, {
      dependsOnTaskId: effectiveDependsOnTaskId,
      dependencyType: nextDependencyType,
    });

    // Keep completedAt consistent with status without requiring callers to set it themselves.
    if (dto.status === TaskStatus.DONE && !task.completedAt) {
      task.completedAt = new Date();
    } else if (dto.status && dto.status !== TaskStatus.DONE) {
      task.completedAt = null;
    }

    return this.tasks.save(task);
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOwnedOrThrow(id, userId);
    await this.tasks.delete(id);
  }
}
