import type { FilterQuery, HydratedDocument } from 'mongoose';
import { University, type UniversityDoc } from '../models/university.model';
import { NotFoundError } from '../lib/http-errors';
import { paginate, type PaginatedResult } from '../lib/pagination';
import { isValidObjectId } from '../validation/common';
import { normalizeName } from '../lib/normalize-name';
import { isDuplicateKeyError } from '../lib/mongo-errors';
import type {
  CreateUniversityInput,
  ListUniversitiesQuery,
  UpdateUniversityInput,
} from '../validation/universities';

/**
 * Personal workspace data, not shared catalog — see `docs/decisions.md`,
 * "Catalog data vs. owned data (superseded)". Every read/write here is
 * scoped to `ownerId`; there is no cross-user visibility and no
 * admin-only mutation gate — the caller's own ownership is the only check.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface CreateUniversityResult {
  university: HydratedDocument<UniversityDoc>;
  /** True only when this call actually inserted a new row. */
  wasCreated: boolean;
  /**
   * Field names where the submitted `input` differed from what the
   * (pre-existing, reused) record already has. Always empty when
   * `wasCreated` is true. Never used to overwrite anything — see
   * `createUniversity()`'s doc comment.
   */
  conflictingFields: string[];
}

const COMPARABLE_FIELDS = ['name', 'country', 'website', 'notes'] as const;

function diffFields(
  input: CreateUniversityInput,
  existing: HydratedDocument<UniversityDoc>,
): string[] {
  const conflicts: string[] = [];
  for (const field of COMPARABLE_FIELDS) {
    const submitted = input[field as keyof CreateUniversityInput];
    if (submitted === undefined) continue;
    const stored = existing[field as keyof UniversityDoc] ?? null;
    if (submitted !== stored) conflicts.push(field);
  }
  return conflicts;
}

/**
 * Reuses an existing row with the same `normalizedName` for this owner
 * instead of creating a near-duplicate — the same real-world university
 * added twice (e.g. once while adding a programme, once from an imported
 * opportunity) should collapse into one record in the user's own workspace,
 * not two. Scoped to `ownerId`: a name match against another user's
 * university is irrelevant and invisible here.
 *
 * **Concurrency-safe by construction**, not by a find-then-create race:
 * `findOneAndUpdate` with `upsert: true` and `$setOnInsert` is one atomic
 * operation — either it inserts (this is a genuinely new university) or it
 * matches an existing row and changes NOTHING on it (bare `$setOnInsert`
 * touches no field unless inserting). The `{ ownerId, normalizedName }`
 * unique index (see `university.model.ts`) is the actual source of truth;
 * this function never trusts its own prior read. Two truly simultaneous
 * inserts for the same new name can still have one of them rejected by
 * MongoDB with a duplicate-key error instead of cleanly reporting a match
 * (a documented behavior of concurrent upserts against a unique index) —
 * that case is caught below and resolved with a follow-up read, so the
 * caller never sees it as a failure.
 *
 * Existing information is never silently overwritten (bare `$setOnInsert`
 * guarantees this) and never silently discarded without being surfaced:
 * `conflictingFields` on the result tells the caller which submitted fields
 * differ from what's already stored, so the route/frontend can say so
 * instead of pretending the submission was fully applied.
 */
export async function createUniversity(
  ownerId: string,
  input: CreateUniversityInput,
): Promise<CreateUniversityResult> {
  const normalizedName = normalizeName(input.name);

  let university: HydratedDocument<UniversityDoc>;
  let wasCreated: boolean;

  try {
    const result = await University.findOneAndUpdate(
      { ownerId, normalizedName },
      { $setOnInsert: { ...input, ownerId, normalizedName } },
      { upsert: true, new: true, includeResultMetadata: true },
    );
    if (!result.value) {
      // Not expected — `upsert: true` + `new: true` always returns the
      // post-upsert document — but fail loudly rather than silently
      // propagate a `null`.
      throw new Error('createUniversity: upsert returned no document');
    }
    university = result.value;
    wasCreated = !result.lastErrorObject?.updatedExisting;
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    // Lost a genuine race to another concurrent insert for this same new
    // name — the winner is now readable; fetch it rather than treating
    // this as a failure (see this function's doc comment).
    const winner = await University.findOne({ ownerId, normalizedName });
    if (!winner) throw err; // Should not happen — re-throw the original error rather than swallow a real problem.
    university = winner;
    wasCreated = false;
  }

  return {
    university,
    wasCreated,
    conflictingFields: wasCreated ? [] : diffFields(input, university),
  };
}

/**
 * Keyset-paginated, ordered by `(name, id)` — matches the composite index
 * declared on the model. `search` is a case-insensitive substring match
 * (the Mongo equivalent of the original's leading-wildcard `ILIKE`).
 */
export async function listUniversities(
  ownerId: string,
  query: ListUniversitiesQuery,
): Promise<PaginatedResult<HydratedDocument<UniversityDoc>>> {
  const filter: FilterQuery<UniversityDoc> = { ownerId };
  if (query.search) {
    filter.name = { $regex: escapeRegExp(query.search), $options: 'i' };
  }
  return paginate(University, {
    filter,
    sortField: 'name',
    sortOrder: query.order ?? 'asc',
    cursor: query.cursor ?? null,
    limit: query.limit ?? null,
  });
}

export async function getUniversityOrThrow(
  id: string,
  ownerId: string,
): Promise<HydratedDocument<UniversityDoc>> {
  if (!isValidObjectId(id)) {
    throw new NotFoundError('University not found');
  }
  const university = await University.findOne({ _id: id, ownerId });
  if (!university) {
    throw new NotFoundError('University not found');
  }
  return university;
}

export async function updateUniversity(
  id: string,
  ownerId: string,
  input: UpdateUniversityInput,
): Promise<HydratedDocument<UniversityDoc>> {
  const university = await getUniversityOrThrow(id, ownerId);
  Object.assign(university, input);
  if (input.name !== undefined) {
    university.normalizedName = normalizeName(input.name);
  }
  await university.save();
  return university;
}

export async function deleteUniversity(id: string, ownerId: string): Promise<void> {
  await getUniversityOrThrow(id, ownerId);
  await University.deleteOne({ _id: id, ownerId });
}
