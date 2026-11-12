import { Types } from 'mongoose';
import { ApplicationJourney, type ApplicationJourneyDoc } from '../models/application-journey.model';
import { NotFoundError } from '../lib/http-errors';
import { paginate, type PaginatedResult } from '../lib/pagination';
import { isValidObjectId } from '../validation/common';
import { getUniversityOrThrow } from './universities.service';
import { getProgrammeOrThrow } from './programmes.service';
import type { HydratedDocument } from 'mongoose';
import type {
  CreateJourneyInput,
  ListJourneysQuery,
  UpdateJourneyInput,
} from '../validation/journeys';

export type JourneyDocument = HydratedDocument<ApplicationJourneyDoc>;

/**
 * Ported from `journeys/journeys.service.ts`. Journeys are the top-level
 * ownership boundary for a user's applications/tasks — every lookup here
 * either belongs to `userId` or doesn't exist as far as the caller can tell
 * (404, never 403 — see `common/utils/ownership.ts`'s doc comment in the
 * original backend for why a resource that exists-but-isn't-yours must
 * respond identically to one that doesn't exist at all).
 */
function assertOwnership(resourceUserId: Types.ObjectId, currentUserId: string): void {
  if (String(resourceUserId) !== String(currentUserId)) {
    throw new NotFoundError('Journey not found');
  }
}

export async function createJourney(
  userId: string,
  dto: CreateJourneyInput,
): Promise<JourneyDocument> {
  // Independent checks — neither depends on the other's result — run concurrently.
  // Also proves the university/programme are owned by this caller — a
  // Journey can never point at another user's catalog identity.
  await Promise.all([
    dto.universityId ? getUniversityOrThrow(dto.universityId, userId) : Promise.resolve(undefined),
    dto.programmeId ? getProgrammeOrThrow(dto.programmeId, userId) : Promise.resolve(undefined),
  ]);
  return ApplicationJourney.create({ ...dto, userId });
}

/** Keyset-paginated, ordered by `(createdAt, _id)` — scoped by `userId` first, pagination never loosens ownership. */
export async function listJourneysForUser(
  userId: string,
  query: ListJourneysQuery,
): Promise<PaginatedResult<JourneyDocument>> {
  return paginate(ApplicationJourney, {
    filter: { userId },
    sortField: 'createdAt',
    sortOrder: query.order ?? 'desc',
    cursor: query.cursor ?? null,
    limit: query.limit ?? null,
  });
}

export async function getJourneyOwnedOrThrow(
  id: string,
  userId: string,
): Promise<JourneyDocument> {
  if (!isValidObjectId(id)) {
    throw new NotFoundError('Journey not found');
  }
  const journey = await ApplicationJourney.findById(id);
  if (!journey) {
    throw new NotFoundError('Journey not found');
  }
  assertOwnership(journey.userId, userId);
  return journey;
}

export async function updateJourney(
  id: string,
  userId: string,
  dto: UpdateJourneyInput,
): Promise<JourneyDocument> {
  const journey = await getJourneyOwnedOrThrow(id, userId);
  await Promise.all([
    dto.universityId ? getUniversityOrThrow(dto.universityId, userId) : Promise.resolve(undefined),
    dto.programmeId ? getProgrammeOrThrow(dto.programmeId, userId) : Promise.resolve(undefined),
  ]);
  Object.assign(journey, dto);
  await journey.save();
  return journey;
}

/**
 * Hard delete, matching the original service's plain
 * `this.journeys.delete(id)` exactly. NOTE (deviation/gap — see this
 * module's final report): the original Postgres schema cascaded this
 * delete automatically (`Application.journeyId` was `onDelete: 'CASCADE'`,
 * and Task/Requirement/Deadline/etc. cascade further from there) — Mongo has
 * no equivalent of a DB-level FK cascade, so deleting a Journey here does
 * NOT remove its Applications (or their Tasks/Requirements/Deadlines/
 * ApplicationDocuments/ApplicationSnapshots), which the original schema did
 * for free. This was not in this port's explicit scope (only the
 * Application-purge cascade was) and touches models owned by a different
 * module/agent (Task/Deadline) enough that it needs a deliberate decision
 * rather than a guess — flagged in the final report instead of silently
 * implemented.
 */
export async function deleteJourney(id: string, userId: string): Promise<void> {
  const journey = await getJourneyOwnedOrThrow(id, userId);
  await ApplicationJourney.deleteOne({ _id: journey._id });
}
