import type { FilterQuery, HydratedDocument } from 'mongoose';
import { Programme, type ProgrammeDoc } from '../models/programme.model';
import { NotFoundError } from '../lib/http-errors';
import { paginate, type PaginatedResult } from '../lib/pagination';
import { isValidObjectId } from '../validation/common';
import type {
  CreateProgrammeInput,
  ListProgrammesQuery,
  UpdateProgrammeInput,
} from '../validation/programmes';
import { getUniversityOrThrow } from './universities.service';

/** Ported from the original NestJS backend's `ProgrammesService`. */

export async function createProgramme(
  input: CreateProgrammeInput,
): Promise<HydratedDocument<ProgrammeDoc>> {
  await getUniversityOrThrow(input.universityId);
  return Programme.create(input);
}

/** Keyset-paginated, ordered by `(name, id)` — matches the composite index declared on the model. */
export async function listProgrammes(
  query: ListProgrammesQuery,
): Promise<PaginatedResult<HydratedDocument<ProgrammeDoc>>> {
  const filter: FilterQuery<ProgrammeDoc> = {};
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
): Promise<HydratedDocument<ProgrammeDoc>> {
  if (!isValidObjectId(id)) {
    throw new NotFoundError('Programme not found');
  }
  const programme = await Programme.findById(id);
  if (!programme) {
    throw new NotFoundError('Programme not found');
  }
  return programme;
}

/** A Programme cannot be silently re-parented to a nonexistent university — re-validated whenever `universityId` is being changed. */
export async function updateProgramme(
  id: string,
  input: UpdateProgrammeInput,
): Promise<HydratedDocument<ProgrammeDoc>> {
  const programme = await getProgrammeOrThrow(id);
  if (input.universityId) {
    await getUniversityOrThrow(input.universityId);
  }
  Object.assign(programme, input);
  await programme.save();
  return programme;
}

export async function deleteProgramme(id: string): Promise<void> {
  await getProgrammeOrThrow(id);
  await Programme.deleteOne({ _id: id });
}
