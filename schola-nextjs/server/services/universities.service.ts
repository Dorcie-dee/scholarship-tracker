import type { FilterQuery, HydratedDocument } from 'mongoose';
import { University, type UniversityDoc } from '../models/university.model';
import { NotFoundError } from '../lib/http-errors';
import { paginate, type PaginatedResult } from '../lib/pagination';
import { isValidObjectId } from '../validation/common';
import type {
  CreateUniversityInput,
  ListUniversitiesQuery,
  UpdateUniversityInput,
} from '../validation/universities';

/**
 * Universities are shared reference/catalog data, not scoped to a single
 * user — see `docs/decisions.md`, "Catalog data vs. owned data". Any
 * authenticated user can read them; mutation is ADMIN-gated at the route
 * layer (`withRoute(..., { roles: [UserRole.ADMIN] })`), not re-checked
 * here. Ported from the original NestJS backend's `UniversitiesService`.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function createUniversity(
  input: CreateUniversityInput,
): Promise<HydratedDocument<UniversityDoc>> {
  return University.create(input);
}

/**
 * Keyset-paginated, ordered by `(name, id)` — matches the composite index
 * declared on the model. `search` is a case-insensitive substring match
 * (the Mongo equivalent of the original's leading-wildcard `ILIKE`).
 */
export async function listUniversities(
  query: ListUniversitiesQuery,
): Promise<PaginatedResult<HydratedDocument<UniversityDoc>>> {
  const filter: FilterQuery<UniversityDoc> = {};
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
): Promise<HydratedDocument<UniversityDoc>> {
  if (!isValidObjectId(id)) {
    throw new NotFoundError('University not found');
  }
  const university = await University.findById(id);
  if (!university) {
    throw new NotFoundError('University not found');
  }
  return university;
}

export async function updateUniversity(
  id: string,
  input: UpdateUniversityInput,
): Promise<HydratedDocument<UniversityDoc>> {
  const university = await getUniversityOrThrow(id);
  Object.assign(university, input);
  await university.save();
  return university;
}

export async function deleteUniversity(id: string): Promise<void> {
  await getUniversityOrThrow(id);
  await University.deleteOne({ _id: id });
}
