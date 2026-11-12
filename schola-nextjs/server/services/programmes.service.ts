import type { FilterQuery, HydratedDocument } from 'mongoose';
import { Programme, type ProgrammeDoc } from '../models/programme.model';
import { NotFoundError } from '../lib/http-errors';
import { paginate, type PaginatedResult } from '../lib/pagination';
import { isValidObjectId } from '../validation/common';
import { normalizeName } from '../lib/normalize-name';
import { isDuplicateKeyError } from '../lib/mongo-errors';
import type {
  CreateProgrammeInput,
  ListProgrammesQuery,
  UpdateProgrammeInput,
} from '../validation/programmes';
import { getUniversityOrThrow } from './universities.service';

/** Personal workspace data — see `universities.service.ts`'s doc comment. */

export interface CreateProgrammeResult {
  programme: HydratedDocument<ProgrammeDoc>;
  wasCreated: boolean;
  conflictingFields: string[];
}

const COMPARABLE_FIELDS = ['name', 'studyLevel', 'field', 'duration', 'website', 'notes'] as const;

function diffFields(input: CreateProgrammeInput, existing: HydratedDocument<ProgrammeDoc>): string[] {
  const conflicts: string[] = [];
  for (const field of COMPARABLE_FIELDS) {
    const submitted = input[field as keyof CreateProgrammeInput];
    if (submitted === undefined) continue;
    const stored = existing[field as keyof ProgrammeDoc] ?? null;
    if (submitted !== stored) conflicts.push(field);
  }
  return conflicts;
}

/**
 * Reuses an existing programme with the same `normalizedName` under the
 * same university for this owner, rather than creating a near-duplicate.
 * Concurrency-safe via an atomic upsert — see `createUniversity()`'s doc
 * comment for the full reasoning (identical here, scoped additionally by
 * `universityId`; see `programme.model.ts`'s unique index).
 */
export async function createProgramme(
  ownerId: string,
  input: CreateProgrammeInput,
): Promise<CreateProgrammeResult> {
  // Also proves the university is owned by this caller — a programme can
  // never be attached to a university it doesn't own.
  await getUniversityOrThrow(input.universityId, ownerId);

  const normalizedName = normalizeName(input.name);
  const matchKey = { ownerId, universityId: input.universityId, normalizedName };

  let programme: HydratedDocument<ProgrammeDoc>;
  let wasCreated: boolean;

  try {
    const result = await Programme.findOneAndUpdate(
      matchKey,
      { $setOnInsert: { ...input, ownerId, normalizedName } },
      { upsert: true, new: true, includeResultMetadata: true },
    );
    if (!result.value) {
      throw new Error('createProgramme: upsert returned no document');
    }
    programme = result.value;
    wasCreated = !result.lastErrorObject?.updatedExisting;
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    const winner = await Programme.findOne(matchKey);
    if (!winner) throw err;
    programme = winner;
    wasCreated = false;
  }

  return {
    programme,
    wasCreated,
    conflictingFields: wasCreated ? [] : diffFields(input, programme),
  };
}

/** Keyset-paginated, ordered by `(name, id)` — matches the composite index declared on the model. */
export async function listProgrammes(
  ownerId: string,
  query: ListProgrammesQuery,
): Promise<PaginatedResult<HydratedDocument<ProgrammeDoc>>> {
  const filter: FilterQuery<ProgrammeDoc> = { ownerId };
  if (query.universityId) {
    filter.universityId = query.universityId;
  }
  return paginate(Programme, {
    filter,
    sortField: 'name',
    sortOrder: query.order ?? 'asc',
    cursor: query.cursor ?? null,
    limit: query.limit ?? null,
  });
}

export async function getProgrammeOrThrow(
  id: string,
  ownerId: string,
): Promise<HydratedDocument<ProgrammeDoc>> {
  if (!isValidObjectId(id)) {
    throw new NotFoundError('Programme not found');
  }
  const programme = await Programme.findOne({ _id: id, ownerId });
  if (!programme) {
    throw new NotFoundError('Programme not found');
  }
  return programme;
}

/** A Programme cannot be silently re-parented to a university the caller doesn't own — re-validated whenever `universityId` is being changed. */
export async function updateProgramme(
  id: string,
  ownerId: string,
  input: UpdateProgrammeInput,
): Promise<HydratedDocument<ProgrammeDoc>> {
  const programme = await getProgrammeOrThrow(id, ownerId);
  if (input.universityId) {
    await getUniversityOrThrow(input.universityId, ownerId);
  }
  Object.assign(programme, input);
  if (input.name !== undefined) {
    programme.normalizedName = normalizeName(input.name);
  }
  await programme.save();
  return programme;
}

export async function deleteProgramme(id: string, ownerId: string): Promise<void> {
  await getProgrammeOrThrow(id, ownerId);
  await Programme.deleteOne({ _id: id, ownerId });
}
