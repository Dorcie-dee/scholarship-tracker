import type { FilterQuery, HydratedDocument } from 'mongoose';
import { Opportunity, type OpportunityDoc } from '../models/opportunity.model';
import { OpportunitySource } from '../models/opportunity-source.model';
import { Requirement } from '../models/requirement.model';
import { Deadline } from '../models/deadline.model';
import { BadRequestError, NotFoundError } from '../lib/http-errors';
import { paginate, type PaginatedResult } from '../lib/pagination';
import { isValidObjectId } from '../validation/common';
import type {
  CreateOpportunityInput,
  ListOpportunitiesQuery,
  UpdateOpportunityInput,
} from '../validation/opportunities';
import { getProgrammeOrThrow } from './programmes.service';
import { getUniversityOrThrow } from './universities.service';

/** Ported from the original NestJS backend's `OpportunitiesService`. */

/**
 * Validates `universityId`/`programmeId` existence (when being set) and the
 * University↔Programme cross-consistency rule: a `programmeId` must belong
 * to the effective `universityId` (new value if being changed, otherwise
 * the document's current value) — an Opportunity must never claim "Programme
 * P at University A" while P actually belongs to University B. `current` is
 * only passed by `updateOpportunity()`, to know the effective
 * university/programme when only one of the two is being changed.
 */
async function validateRelationships(
  input: Partial<CreateOpportunityInput>,
  current?: HydratedDocument<OpportunityDoc>,
): Promise<void> {
  const universityIdChanging = input.universityId !== undefined;
  const programmeIdChanging = input.programmeId !== undefined;

  const effectiveUniversityId = universityIdChanging
    ? input.universityId
    : (current?.universityId ? String(current.universityId) : undefined);
  const effectiveProgrammeId = programmeIdChanging
    ? input.programmeId
    : (current?.programmeId ? String(current.programmeId) : undefined);

  const universityCheck = universityIdChanging
    ? getUniversityOrThrow(input.universityId as string)
    : Promise.resolve(undefined);

  const needsProgrammeRow =
    programmeIdChanging || (Boolean(effectiveProgrammeId) && Boolean(effectiveUniversityId));
  const programmeCheck = needsProgrammeRow
    ? getProgrammeOrThrow(effectiveProgrammeId as string)
    : Promise.resolve(undefined);

  const [, programme] = await Promise.all([universityCheck, programmeCheck]);

  if (
    programme &&
    effectiveUniversityId &&
    String(programme.universityId) !== effectiveUniversityId
  ) {
    throw new BadRequestError(
      'The specified programmeId does not belong to the specified universityId',
    );
  }
}

/** `POST /opportunities` is open to any authenticated user — see `docs/decisions.md`, "RBAC dependency". */
export async function createOpportunity(
  input: CreateOpportunityInput,
): Promise<HydratedDocument<OpportunityDoc>> {
  await validateRelationships(input);
  return Opportunity.create(input);
}

/** Keyset-paginated, ordered by `(createdAt, id)` DESC (newest first) — matches the composite index declared on the model. */
export async function listOpportunities(
  query: ListOpportunitiesQuery,
): Promise<PaginatedResult<HydratedDocument<OpportunityDoc>>> {
  const filter: FilterQuery<OpportunityDoc> = {};
  if (query.studyLevel) filter.studyLevel = query.studyLevel;
  if (query.country) filter.country = query.country;
  if (query.opportunityType) filter.opportunityType = query.opportunityType;
  if (query.universityId) filter.universityId = query.universityId;
  if (query.programmeId) filter.programmeId = query.programmeId;
  if (query.ids) {
    // Malformed ids are dropped rather than rejected — a bulk lookup by a
    // caller-supplied id list should return what it can match, the same way
    // any other filter here would just match nothing rather than 400 for an
    // id that happens not to exist.
    const validIds = query.ids
      .split(',')
      .map((id) => id.trim())
      .filter(isValidObjectId);
    filter._id = { $in: validIds };
  }

  return paginate(Opportunity, {
    filter,
    sortField: 'createdAt',
    sortOrder: query.order ?? 'desc',
    cursor: query.cursor ?? null,
    limit: query.limit ?? null,
  });
}

/**
 * Lean existence check — no related rows loaded. Use this whenever the
 * caller only needs to confirm an opportunityId is valid (every FK-
 * validation call site, plus this service's own update/remove). For the
 * actual detail view, use `getOpportunityWithDetailsOrThrow` instead.
 */
export async function getOpportunityOrThrow(
  id: string,
): Promise<HydratedDocument<OpportunityDoc>> {
  if (!isValidObjectId(id)) {
    throw new NotFoundError('Opportunity not found');
  }
  const opportunity = await Opportunity.findById(id);
  if (!opportunity) {
    throw new NotFoundError('Opportunity not found');
  }
  return opportunity;
}

/**
 * Full detail load, including sources/requirements/deadlines — used by
 * `GET /opportunities/:id`. These live in separate collections (no Mongoose
 * relation on `Opportunity` itself), so they're fetched with their own
 * `opportunityId`-filtered queries rather than a TypeORM-style `relations`
 * eager-load.
 */
export async function getOpportunityWithDetailsOrThrow(
  id: string,
): Promise<Record<string, unknown>> {
  const opportunity = await getOpportunityOrThrow(id);
  const [sources, requirements, deadlines] = await Promise.all([
    OpportunitySource.find({ opportunityId: opportunity._id }).sort({ capturedAt: -1, _id: -1 }),
    Requirement.find({ opportunityId: opportunity._id }),
    Deadline.find({ opportunityId: opportunity._id }),
  ]);

  const json = opportunity.toJSON() as Record<string, unknown>;
  json.sources = sources.map((source) => source.toJSON());
  json.requirements = requirements.map((requirement) => requirement.toJSON());
  json.deadlines = deadlines.map((deadline) => deadline.toJSON());
  return json;
}

export async function updateOpportunity(
  id: string,
  input: UpdateOpportunityInput,
): Promise<HydratedDocument<OpportunityDoc>> {
  const opportunity = await getOpportunityOrThrow(id);
  await validateRelationships(input, opportunity);
  Object.assign(opportunity, input);
  await opportunity.save();
  return opportunity;
}

export async function deleteOpportunity(id: string): Promise<void> {
  await getOpportunityOrThrow(id);
  await Opportunity.deleteOne({ _id: id });
}
