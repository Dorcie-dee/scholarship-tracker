import { Types, type HydratedDocument } from 'mongoose';
import { Deadline, type DeadlineDoc } from '../models/deadline.model';
import { Task } from '../models/task.model';
import { Requirement } from '../models/requirement.model';
import { Opportunity } from '../models/opportunity.model';
import { ApplicationJourney } from '../models/application-journey.model';
import { BadRequestError, NotFoundError } from '../lib/http-errors';
import { paginate, type PaginatedResult } from '../lib/pagination';
import {
  assertValidObjectId,
  findLiveApplicationIds,
  findOwnedOpportunityOrThrow,
  findOwnedApplicationOrThrow,
} from './access';
import { findTaskAccessible } from './tasks.service';
import { findRequirementAccessible } from './requirements.service';
import type { CreateDeadlineInput, UpdateDeadlineInput } from '../validation/deadlines';

type HydratedDeadline = HydratedDocument<DeadlineDoc>;

interface LinkFields {
  opportunityId?: string;
  applicationId?: string;
  taskId?: string;
  requirementId?: string;
}

/**
 * Ported from `deadlines/deadlines.service.ts`. A Deadline can attach to any
 * combination of Opportunity/Application/Task/Requirement — ownership is
 * checked through whichever of Opportunity/Application/Task/Requirement is
 * set (each of those enforces its own ownership, Application additionally
 * enforcing the "soft-deleted parent" exclusion transitively).
 *
 * Group B / I1 parity — the up to four checks are independent of each
 * other's result, so they run concurrently via `Promise.all`.
 */
async function validateAndAuthorizeLinks(userId: string, links: LinkFields): Promise<void> {
  await Promise.all([
    links.opportunityId ? findOwnedOpportunityOrThrow(links.opportunityId, userId) : Promise.resolve(undefined),
    links.applicationId ? findOwnedApplicationOrThrow(links.applicationId, userId) : Promise.resolve(undefined),
    links.taskId ? findTaskAccessible(links.taskId, userId) : Promise.resolve(undefined),
    links.requirementId ? findRequirementAccessible(links.requirementId, userId) : Promise.resolve(undefined),
  ]);
}

export async function createDeadline(userId: string, input: CreateDeadlineInput): Promise<HydratedDeadline> {
  if (!input.opportunityId && !input.applicationId && !input.taskId && !input.requirementId) {
    throw new BadRequestError(
      'A deadline must be linked to at least one of opportunityId, applicationId, taskId, requirementId',
    );
  }
  await validateAndAuthorizeLinks(userId, input);

  return Deadline.create({
    label: input.label,
    deadlineType: input.deadlineType,
    date: new Date(input.date),
    status: input.status,
    opportunityId: input.opportunityId ?? null,
    applicationId: input.applicationId ?? null,
    taskId: input.taskId ?? null,
    requirementId: input.requirementId ?? null,
    notes: input.notes ?? null,
  });
}

export async function listDeadlines(
  userId: string,
  filters: LinkFields,
  query: { cursor?: string | null; limit?: string | number | null; order?: 'asc' | 'desc' },
): Promise<PaginatedResult<HydratedDeadline>> {
  const hasFilter = Boolean(
    filters.opportunityId || filters.applicationId || filters.taskId || filters.requirementId,
  );

  let filter: Record<string, unknown>;

  if (hasFilter) {
    await validateAndAuthorizeLinks(userId, filters);
    filter = {};
    if (filters.opportunityId) filter.opportunityId = filters.opportunityId;
    if (filters.applicationId) filter.applicationId = filters.applicationId;
    if (filters.taskId) filter.taskId = filters.taskId;
    if (filters.requirementId) filter.requirementId = filters.requirementId;
  } else {
    // "All mine" fallback, mirroring `tasks.service.ts#listTasks`'s same
    // pattern — every deadline reachable from something the caller owns (an
    // opportunity, an application, a task, or a requirement), across every
    // journey. Lets a dashboard compute a "due soon" feed in a handful of
    // calls instead of one request per application.
    const journeyIds = (await ApplicationJourney.find({ userId }).select('_id').lean()).map(
      (j) => j._id as Types.ObjectId,
    );
    const liveApplicationIds = await findLiveApplicationIds(journeyIds);
    const [ownedTaskIds, ownedRequirementIds, ownedOpportunityIds] = await Promise.all([
      Task.find({ journeyId: { $in: journeyIds } })
        .select('_id')
        .lean()
        .then((rows) => rows.map((r) => r._id as Types.ObjectId)),
      Requirement.find({ applicationId: { $in: liveApplicationIds } })
        .select('_id')
        .lean()
        .then((rows) => rows.map((r) => r._id as Types.ObjectId)),
      Opportunity.find({ ownerId: userId })
        .select('_id')
        .lean()
        .then((rows) => rows.map((o) => o._id as Types.ObjectId)),
    ]);
    filter = {
      $or: [
        { applicationId: { $in: liveApplicationIds } },
        { taskId: { $in: ownedTaskIds } },
        { requirementId: { $in: ownedRequirementIds } },
        { opportunityId: { $in: ownedOpportunityIds } },
      ],
    };
  }

  return paginate(Deadline, {
    filter,
    sortField: 'date',
    sortOrder: query.order === 'desc' ? 'desc' : 'asc',
    cursor: query.cursor,
    limit: query.limit,
  }) as Promise<PaginatedResult<HydratedDeadline>>;
}

async function findDeadlineEntityOrThrow(id: string): Promise<HydratedDeadline> {
  assertValidObjectId(id, 'Deadline');
  const deadline = await Deadline.findById(id);
  if (!deadline) {
    throw new NotFoundError('Deadline not found');
  }
  return deadline as HydratedDeadline;
}

export async function findDeadlineAccessible(id: string, userId: string): Promise<HydratedDeadline> {
  const deadline = await findDeadlineEntityOrThrow(id);
  await validateAndAuthorizeLinks(userId, {
    opportunityId: deadline.opportunityId ? String(deadline.opportunityId) : undefined,
    applicationId: deadline.applicationId ? String(deadline.applicationId) : undefined,
    taskId: deadline.taskId ? String(deadline.taskId) : undefined,
    requirementId: deadline.requirementId ? String(deadline.requirementId) : undefined,
  });
  return deadline;
}

export async function updateDeadline(
  id: string,
  userId: string,
  input: UpdateDeadlineInput,
): Promise<HydratedDeadline> {
  const deadline = await findDeadlineAccessible(id, userId);

  // findDeadlineAccessible already proved the deadline's CURRENT link values
  // are valid/owned — only re-validate a link field if the input is actually
  // changing it to something new.
  const changedLinks: LinkFields = {};
  if (input.opportunityId !== undefined && input.opportunityId !== (deadline.opportunityId ? String(deadline.opportunityId) : undefined)) {
    changedLinks.opportunityId = input.opportunityId;
  }
  if (input.applicationId !== undefined && input.applicationId !== (deadline.applicationId ? String(deadline.applicationId) : undefined)) {
    changedLinks.applicationId = input.applicationId;
  }
  if (input.taskId !== undefined && input.taskId !== (deadline.taskId ? String(deadline.taskId) : undefined)) {
    changedLinks.taskId = input.taskId;
  }
  if (input.requirementId !== undefined && input.requirementId !== (deadline.requirementId ? String(deadline.requirementId) : undefined)) {
    changedLinks.requirementId = input.requirementId;
  }
  await validateAndAuthorizeLinks(userId, changedLinks);

  Object.assign(deadline, input, {
    date: input.date ? new Date(input.date) : deadline.date,
  });
  return deadline.save();
}

export async function removeDeadline(id: string, userId: string): Promise<void> {
  await findDeadlineAccessible(id, userId);
  await Deadline.deleteOne({ _id: id });
}
