import type { HydratedDocument } from 'mongoose';
import { Requirement, type RequirementDoc } from '../models/requirement.model';
import { paginate, type PaginatedResult } from '../lib/pagination';
import { BadRequestError, NotFoundError } from '../lib/http-errors';
import {
  assertApplicationOwnedByUser,
  assertValidObjectId,
  findOpportunityOrThrow,
} from './access';
import type { CreateRequirementInput, UpdateRequirementInput } from '../validation/requirements';

/**
 * Ported from `requirements/requirements.service.ts`. A Requirement can be
 * scoped to an Opportunity (shared catalog data — no ownership check), an
 * Application (user-owned — ownership enforced via `access.ts`), or both.
 */

export async function createRequirement(
  userId: string,
  input: CreateRequirementInput,
): Promise<HydratedDocument<RequirementDoc>> {
  if (!input.opportunityId && !input.applicationId) {
    throw new BadRequestError(
      'A requirement must be linked to an opportunityId and/or applicationId',
    );
  }
  if (input.opportunityId) {
    await findOpportunityOrThrow(input.opportunityId);
  }
  if (input.applicationId) {
    await assertApplicationOwnedByUser(input.applicationId, userId);
  }

  return Requirement.create({
    requirementType: input.requirementType,
    description: input.description,
    status: input.status,
    opportunityId: input.opportunityId ?? null,
    applicationId: input.applicationId ?? null,
    notes: input.notes ?? null,
  });
}

export async function listRequirements(
  userId: string,
  filters: { opportunityId?: string; applicationId?: string },
  query: { cursor?: string | null; limit?: string | number | null; order?: 'asc' | 'desc' },
): Promise<PaginatedResult<HydratedDocument<RequirementDoc>>> {
  if (!filters.opportunityId && !filters.applicationId) {
    throw new BadRequestError(
      'Provide opportunityId and/or applicationId to list requirements',
    );
  }
  if (filters.applicationId) {
    await assertApplicationOwnedByUser(filters.applicationId, userId);
  }

  const filter: Record<string, unknown> = {};
  if (filters.opportunityId) filter.opportunityId = filters.opportunityId;
  if (filters.applicationId) filter.applicationId = filters.applicationId;

  return paginate(Requirement, {
    filter,
    sortField: 'createdAt',
    sortOrder: query.order === 'desc' ? 'desc' : 'asc',
    cursor: query.cursor,
    limit: query.limit,
  });
}

async function findRequirementEntityOrThrow(id: string): Promise<HydratedDocument<RequirementDoc>> {
  assertValidObjectId(id, 'Requirement');
  const requirement = await Requirement.findById(id);
  if (!requirement) {
    throw new NotFoundError('Requirement not found');
  }
  return requirement as HydratedDocument<RequirementDoc>;
}

/**
 * Used by this module's own routes AND by Tasks/Deadlines services (which
 * accept a `requirementId` link) — exactly like the original's
 * `findOneAccessible()`, which other services also called directly.
 */
export async function findRequirementAccessible(
  id: string,
  userId: string,
): Promise<HydratedDocument<RequirementDoc>> {
  const requirement = await findRequirementEntityOrThrow(id);
  if (requirement.applicationId) {
    await assertApplicationOwnedByUser(String(requirement.applicationId), userId);
  }
  return requirement;
}

export async function updateRequirement(
  id: string,
  userId: string,
  input: UpdateRequirementInput,
): Promise<HydratedDocument<RequirementDoc>> {
  const requirement = await findRequirementAccessible(id, userId);
  if (input.opportunityId) {
    await findOpportunityOrThrow(input.opportunityId);
  }
  if (input.applicationId) {
    await assertApplicationOwnedByUser(input.applicationId, userId);
  }
  Object.assign(requirement, input);
  return requirement.save();
}

export async function removeRequirement(id: string, userId: string): Promise<void> {
  await findRequirementAccessible(id, userId);
  await Requirement.deleteOne({ _id: id });
}
