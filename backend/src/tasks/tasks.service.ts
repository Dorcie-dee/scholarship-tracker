import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { TaskDependencyType, TaskStatus } from '../types';
import { AppConfig } from '../config/configuration';
import {
  applyKeysetPagination,
  buildPaginatedResult,
  decodeCursor,
  PaginatedResult,
  resolvePageSize,
} from '../common/pagination/cursor';
import { Task } from './entities/task.entity';
import { JourneysService } from '../journeys/journeys.service';
import { ApplicationsService } from '../applications/applications.service';
import { RequirementsService } from '../requirements/requirements.service';
import { assertOwnership } from '../common/utils/ownership';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';

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
    private readonly configService: ConfigService<AppConfig, true>,
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

  /**
   * Production hardening (Batch 4) — keyset-paginated, ordered by
   * `(createdAt, id)` DESC. Deliberately NOT `dueDate` (the previous default
   * order) — `dueDate` is nullable, and a correct keyset comparison across a
   * nullable column needs materially more complex SQL (NULLS-LAST handling
   * on both sides of the cursor comparison) for no corresponding benefit
   * here; `createdAt` is the same, always-present, monotonic axis every
   * other paginated list in this codebase already uses. Still joined
   * through `journey` to scope by `userId` first — pagination never loosens
   * ownership. Clients that need "soonest due date" ordering can still sort
   * client-side within a page, or filter by `dueDate` — no server-side
   * capability was removed, only the *default* list order changed.
   */
  async findAllForUser(
    userId: string,
    filters: { journeyId?: string; applicationId?: string },
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<Task>> {
    const { defaultPageSize, maxPageSize } = this.configService.get(
      'pagination',
      { infer: true },
    );
    const limit = resolvePageSize(query.limit, {
      defaultPageSize,
      maxPageSize,
    });
    const direction = query.order === 'asc' ? 'ASC' : 'DESC';

    const qb = this.tasks
      .createQueryBuilder('task')
      .innerJoin('task.journey', 'journey')
      .andWhere('journey.userId = :userId', { userId })
      // Product rule (soft-deleted Applications must not remain visible) —
      // a Task's ownership anchor is its Journey (never soft-deleted), so
      // this join+filter is the one place that needs to exist for the list
      // path: a task attached to an Application still has its own
      // independent row here, and nothing else in this query would
      // otherwise notice that Application is gone. `LEFT JOIN` (not
      // `INNER JOIN`) because `applicationId` is nullable — a
      // journey-level task with no Application must still appear.
      //
      // The filter is `application.id IS NOT NULL`, NOT `application.
      // deletedAt IS NULL` — confirmed by inspecting the actual generated
      // SQL, not assumed: TypeORM automatically appends the joined entity's
      // own `@DeleteDateColumn` condition to the JOIN's ON clause itself
      // (`LEFT JOIN applications application ON application.id = task.
      // application_id AND application.deleted_at IS NULL`), so a
      // soft-deleted Application already fails to match and `application`
      // comes back NULL from the join — indistinguishable, to a WHERE
      // clause checking `application.deletedAt IS NULL`, from a task that
      // never had an application at all (`NULL IS NULL` is true in SQL
      // either way). Checking `application.id IS NOT NULL` instead asks the
      // right question: "did the join actually find a live application",
      // which is exactly what determines whether this task should be
      // visible.
      .leftJoin('task.application', 'application')
      .andWhere('(task.applicationId IS NULL OR application.id IS NOT NULL)');
    if (filters.journeyId) {
      qb.andWhere('task.journeyId = :journeyId', {
        journeyId: filters.journeyId,
      });
    }
    if (filters.applicationId) {
      qb.andWhere('task.applicationId = :applicationId', {
        applicationId: filters.applicationId,
      });
    }
    applyKeysetPagination(
      qb,
      'task.createdAt',
      'task.id',
      direction,
      query.cursor ? decodeCursor(query.cursor) : undefined,
      limit,
    );

    const rows = await qb.getMany();
    return buildPaginatedResult(
      rows,
      limit,
      (r) => r.createdAt.toISOString(),
      (r) => r.id,
    );
  }

  /**
   * Product rule — a soft-deleted Application's Tasks must not remain
   * normally retrievable, even though a Task's own ownership anchor is its
   * Journey (never soft-deleted itself). Deliberately a query builder, not
   * `repository.findOne({relations})`: `findOne()`'s automatic
   * `@DeleteDateColumn` exclusion only applies to the entity it's called
   * directly ON (`Task` here), not to a relation loaded alongside it.
   *
   * The filter is `application.id IS NOT NULL`, NOT `application.deletedAt
   * IS NULL` — confirmed by inspecting the actual generated SQL against
   * real Postgres, not assumed: TypeORM automatically appends the joined
   * entity's own `@DeleteDateColumn` condition to the JOIN's ON clause
   * itself (`LEFT JOIN applications application ON application.id = task.
   * application_id AND application.deleted_at IS NULL`), so a soft-deleted
   * Application already fails to match and `application` comes back NULL
   * from the join — indistinguishable, to a WHERE clause checking
   * `application.deletedAt IS NULL`, from a task that never had an
   * application at all (`NULL IS NULL` is true in SQL either way). An
   * earlier version of this exact fix used `application.deletedAt IS NULL`
   * and silently failed to exclude anything — caught only by a real HTTP
   * integration test against real Postgres, not by a unit test with a
   * hand-rolled query-builder mock (see tasks.service.spec.ts and
   * test/http-integration/soft-delete-visibility.http-integration-spec.ts).
   * `LEFT JOIN` (not `INNER JOIN`) is still required because `applicationId`
   * is nullable — a journey-level task with no Application must still be
   * found.
   */
  private async findWithJourneyOrThrow(id: string): Promise<Task> {
    const task = await this.tasks
      .createQueryBuilder('task')
      .innerJoinAndSelect('task.journey', 'journey')
      .leftJoin('task.application', 'application')
      .where('task.id = :id', { id })
      .andWhere('(task.applicationId IS NULL OR application.id IS NOT NULL)')
      .getOne();
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
