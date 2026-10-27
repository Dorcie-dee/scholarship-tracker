import { Types, type HydratedDocument } from 'mongoose';
import { Task, type TaskDoc } from '../models/task.model';
import { ApplicationJourney } from '../models/application-journey.model';
import { TaskDependencyType, TaskStatus } from '../lib/enums';
import { BadRequestError, NotFoundError } from '../lib/http-errors';
import { paginate, type PaginatedResult } from '../lib/pagination';
import {
  assertValidObjectId,
  findLiveApplicationIds,
  findOwnedApplicationOrThrow,
  findOwnedJourneyOrThrow,
  isApplicationLiveAndOwned,
} from './access';
import { findRequirementAccessible } from './requirements.service';
import type { CreateTaskInput, UpdateTaskInput } from '../validation/tasks';

type HydratedTask = HydratedDocument<TaskDoc>;

/**
 * Ported from `tasks/tasks.service.ts`. Tasks are always owned via their
 * `journeyId` — this is what makes ownership checks possible for tasks with
 * no `applicationId`. `dependsOnTaskId`/`dependencyType` are informational
 * only (never enforced as a workflow blocker) but their *scope* is validated.
 */

/**
 * Group C / C2 — a dependency target must stay within the same workflow
 * scope: an application-scoped dependent task may only depend on a task in
 * the SAME application; a journey-level dependent task (no applicationId)
 * may only depend on another journey-level task in the SAME journey.
 */
function validateDependencyScope(
  dependentTaskId: string | undefined,
  effectiveApplicationId: string | null,
  effectiveJourneyId: string,
  target: HydratedTask,
): void {
  if (dependentTaskId && String(target._id) === dependentTaskId) {
    throw new BadRequestError('A task cannot depend on itself');
  }
  if (effectiveApplicationId) {
    if (String(target.applicationId ?? '') !== effectiveApplicationId) {
      throw new BadRequestError(
        'dependsOnTaskId must reference a task belonging to the same Application',
      );
    }
    return;
  }
  if (target.applicationId) {
    throw new BadRequestError(
      'A journey-level task cannot depend on an application-scoped task',
    );
  }
  if (String(target.journeyId) !== effectiveJourneyId) {
    throw new BadRequestError(
      'dependsOnTaskId must reference a task belonging to the same Journey',
    );
  }
}

export async function createTask(userId: string, input: CreateTaskInput): Promise<HydratedTask> {
  if (input.dependencyType && !input.dependsOnTaskId) {
    throw new BadRequestError('dependencyType requires a dependsOnTaskId');
  }

  const [, application, , dependencyTarget] = await Promise.all([
    findOwnedJourneyOrThrow(input.journeyId, userId),
    input.applicationId
      ? findOwnedApplicationOrThrow(input.applicationId, userId)
      : Promise.resolve(undefined),
    input.requirementId
      ? findRequirementAccessible(input.requirementId, userId)
      : Promise.resolve(undefined),
    input.dependsOnTaskId
      ? findTaskAccessible(input.dependsOnTaskId, userId)
      : Promise.resolve(undefined),
  ]);

  if (application && String(application.journeyId) !== input.journeyId) {
    throw new BadRequestError('applicationId does not belong to the given journeyId');
  }

  if (dependencyTarget) {
    validateDependencyScope(undefined, input.applicationId ?? null, input.journeyId, dependencyTarget);
  }

  return Task.create({
    title: input.title,
    description: input.description ?? null,
    status: input.status,
    priority: input.priority,
    dueDate: input.dueDate ?? null,
    applicationId: input.applicationId ?? null,
    journeyId: input.journeyId,
    requirementId: input.requirementId ?? null,
    dependsOnTaskId: input.dependsOnTaskId ?? null,
    dependencyType: input.dependsOnTaskId ? (input.dependencyType ?? TaskDependencyType.SOFT) : null,
  });
}

/**
 * A Task's ownership anchor is its Journey (never soft-deleted itself), but a
 * Task attached to a soft-deleted Application must not remain visible — see
 * `access.ts`'s `findLiveApplicationIds()`. `$or` excludes exactly that case
 * while still allowing journey-level tasks (`applicationId: null`) through.
 */
export async function listTasks(
  userId: string,
  filters: { journeyId?: string; applicationId?: string },
  query: { cursor?: string | null; limit?: string | number | null; order?: 'asc' | 'desc' },
): Promise<PaginatedResult<HydratedTask>> {
  let journeyIds: Types.ObjectId[];
  if (filters.journeyId) {
    const journey = await findOwnedJourneyOrThrow(filters.journeyId, userId);
    journeyIds = [journey._id];
  } else {
    const journeys = await ApplicationJourney.find({ userId }).select('_id').lean();
    journeyIds = journeys.map((j) => j._id as Types.ObjectId);
  }

  const liveApplicationIds = await findLiveApplicationIds(journeyIds);

  const filter: Record<string, unknown> = {
    journeyId: { $in: journeyIds },
    $or: [{ applicationId: null }, { applicationId: { $in: liveApplicationIds } }],
  };
  if (filters.applicationId) {
    filter.applicationId = filters.applicationId;
  }

  return paginate(Task, {
    filter,
    sortField: 'createdAt',
    sortOrder: query.order === 'asc' ? 'asc' : 'desc',
    cursor: query.cursor,
    limit: query.limit,
  }) as Promise<PaginatedResult<HydratedTask>>;
}

async function findTaskEntityOrThrow(id: string): Promise<HydratedTask> {
  assertValidObjectId(id, 'Task');
  const task = await Task.findById(id);
  if (!task) {
    throw new NotFoundError('Task not found');
  }
  return task as HydratedTask;
}

/**
 * Also used by Deadlines/Requirements services for a `taskId` link check —
 * same role as the original's `findOwnedOrThrow()`.
 */
export async function findTaskAccessible(id: string, userId: string): Promise<HydratedTask> {
  const task = await findTaskEntityOrThrow(id);
  const journey = await ApplicationJourney.findById(task.journeyId);
  if (!journey || String(journey.userId) !== userId) {
    throw new NotFoundError('Task not found');
  }
  if (task.applicationId && !(await isApplicationLiveAndOwned(task.applicationId, userId))) {
    throw new NotFoundError('Task not found');
  }
  return task;
}

export async function updateTask(
  id: string,
  userId: string,
  input: UpdateTaskInput,
): Promise<HydratedTask> {
  const task = await findTaskAccessible(id, userId);

  const journeyIdChanging = input.journeyId !== undefined && input.journeyId !== String(task.journeyId);
  const applicationIdChanging =
    input.applicationId !== undefined &&
    input.applicationId !== (task.applicationId ? String(task.applicationId) : undefined);

  const effectiveJourneyId = journeyIdChanging ? (input.journeyId as string) : String(task.journeyId);
  const effectiveApplicationId = applicationIdChanging
    ? (input.applicationId as string)
    : task.applicationId
      ? String(task.applicationId)
      : null;

  const needsApplicationRecord =
    applicationIdChanging || (Boolean(effectiveApplicationId) && journeyIdChanging);

  const dependsOnTaskIdProvided = Object.prototype.hasOwnProperty.call(input, 'dependsOnTaskId');
  const clearingDependency = dependsOnTaskIdProvided && input.dependsOnTaskId === null;
  const settingNewDependency =
    dependsOnTaskIdProvided && input.dependsOnTaskId !== null && input.dependsOnTaskId !== undefined;

  if (settingNewDependency && input.dependsOnTaskId === id) {
    throw new BadRequestError('A task cannot depend on itself');
  }

  const [, applicationRecord, , dependencyTarget] = await Promise.all([
    journeyIdChanging ? findOwnedJourneyOrThrow(input.journeyId as string, userId) : Promise.resolve(undefined),
    needsApplicationRecord
      ? findOwnedApplicationOrThrow(effectiveApplicationId as string, userId)
      : Promise.resolve(undefined),
    input.requirementId ? findRequirementAccessible(input.requirementId, userId) : Promise.resolve(undefined),
    settingNewDependency
      ? findTaskAccessible(input.dependsOnTaskId as string, userId)
      : Promise.resolve(undefined),
  ]);

  if (applicationRecord && String(applicationRecord.journeyId) !== effectiveJourneyId) {
    throw new BadRequestError('applicationId does not belong to the given journeyId');
  }

  if (dependencyTarget) {
    validateDependencyScope(id, effectiveApplicationId, effectiveJourneyId, dependencyTarget);
  }

  const effectiveDependsOnTaskId = clearingDependency
    ? null
    : settingNewDependency
      ? (input.dependsOnTaskId as string)
      : task.dependsOnTaskId
        ? String(task.dependsOnTaskId)
        : null;

  let nextDependencyType: TaskDependencyType | null;
  if (clearingDependency) {
    nextDependencyType = null;
  } else if (input.dependencyType !== undefined) {
    nextDependencyType = input.dependencyType;
  } else if (settingNewDependency) {
    nextDependencyType = TaskDependencyType.SOFT;
  } else {
    nextDependencyType = task.dependencyType;
  }

  if (nextDependencyType && !effectiveDependsOnTaskId) {
    throw new BadRequestError('dependencyType requires a dependsOnTaskId');
  }

  Object.assign(task, input, {
    dependsOnTaskId: effectiveDependsOnTaskId,
    dependencyType: nextDependencyType,
  });

  // Keep completedAt consistent with status without requiring callers to set it themselves.
  if (input.status === TaskStatus.DONE && !task.completedAt) {
    task.completedAt = new Date();
  } else if (input.status && input.status !== TaskStatus.DONE) {
    task.completedAt = null;
  }

  return task.save();
}

export async function removeTask(id: string, userId: string): Promise<void> {
  await findTaskAccessible(id, userId);
  await Task.deleteOne({ _id: id });
}
