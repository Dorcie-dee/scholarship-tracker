import { Types } from 'mongoose';
import { Application, type ApplicationDoc } from '../models/application.model';
import { ApplicationJourney, type ApplicationJourneyDoc } from '../models/application-journey.model';
import { Opportunity, type OpportunityDoc } from '../models/opportunity.model';
import { NotFoundError } from '../lib/http-errors';

/**
 * Shared ownership helpers for the Tasks/Deadlines/Requirements/Documents
 * services — these all need to verify a Journey/Application they don't own
 * (Journeys/Applications belong to a different agent's module), but the
 * instructions explicitly allow reading the `Application`/`ApplicationJourney`
 * **models** directly for exactly this purpose. Deliberately NOT named
 * `applications.service.ts`/`journeys.service.ts` (those are reserved for the
 * other agent).
 *
 * Mirrors the original NestJS backend's `assertOwnership()` helper
 * (`common/utils/ownership.ts`): a resource that exists but belongs to another
 * user responds identically (404) to one that doesn't exist at all — never a
 * 403 that would leak existence.
 */

type HydratedDoc<T> = T & { _id: Types.ObjectId };

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

/**
 * A malformed id can never match a real document — treated as a 404 rather
 * than letting Mongoose's CastError bubble up as an unhandled 500. (The
 * original Postgres backend's `uuid` column type would behave similarly: an
 * invalid UUID literal never matches any row.)
 */
export function assertValidObjectId(id: string, label = 'Resource'): void {
  if (!OBJECT_ID_RE.test(id)) {
    throw new NotFoundError(`${label} not found`);
  }
}

export async function findOwnedJourneyOrThrow(
  journeyId: string,
  userId: string,
): Promise<HydratedDoc<ApplicationJourneyDoc>> {
  assertValidObjectId(journeyId, 'Journey');
  const journey = await ApplicationJourney.findById(journeyId);
  if (!journey || String(journey.userId) !== userId) {
    throw new NotFoundError('Journey not found');
  }
  return journey as HydratedDoc<ApplicationJourneyDoc>;
}

/**
 * Fetches an Application the caller owns (via its Journey), excluding
 * soft-deleted rows — `deletedAt: null` is never implicit in Mongoose (unlike
 * TypeORM's `@DeleteDateColumn` auto-exclusion), so every lookup here filters
 * it explicitly. This is also what makes the Tasks/Deadlines/Requirements
 * "soft-deleted Application's children must not be visible" rule hold: any
 * caller that routes an ownership check for an `applicationId` through this
 * function automatically gets that exclusion for free.
 */
export async function findOwnedApplicationOrThrow(
  applicationId: string,
  userId: string,
): Promise<HydratedDoc<ApplicationDoc>> {
  assertValidObjectId(applicationId, 'Application');
  const application = await Application.findOne({ _id: applicationId, deletedAt: null });
  if (!application) {
    throw new NotFoundError('Application not found');
  }
  const journey = await ApplicationJourney.findById(application.journeyId);
  if (!journey || String(journey.userId) !== userId) {
    throw new NotFoundError('Application not found');
  }
  return application as HydratedDoc<ApplicationDoc>;
}

export async function assertApplicationOwnedByUser(
  applicationId: string,
  userId: string,
): Promise<void> {
  await findOwnedApplicationOrThrow(applicationId, userId);
}

/** Whether a (possibly null/undefined) applicationId currently resolves to a live, owned Application. */
export async function isApplicationLiveAndOwned(
  applicationId: Types.ObjectId | string | null | undefined,
  userId: string,
): Promise<boolean> {
  if (!applicationId) return true; // nothing to check — not application-scoped at all
  try {
    await findOwnedApplicationOrThrow(String(applicationId), userId);
    return true;
  } catch {
    return false;
  }
}

/** Opportunities are shared catalog data — existence-only check, no ownership dimension. */
export async function findOpportunityOrThrow(
  opportunityId: string,
): Promise<HydratedDoc<OpportunityDoc>> {
  assertValidObjectId(opportunityId, 'Opportunity');
  const opportunity = await Opportunity.findById(opportunityId);
  if (!opportunity) {
    throw new NotFoundError('Opportunity not found');
  }
  return opportunity as HydratedDoc<OpportunityDoc>;
}

/**
 * The set of `Application._id`s, among `journeyIds`, that are live (not
 * soft-deleted) — used to build the "exclude children of a soft-deleted
 * Application" `$or` clause on list queries (see tasks.service.ts/
 * deadlines.service.ts). Returned as strings for cheap `.includes()` checks;
 * callers needing a Mongo query use them directly in an `$in`.
 */
export async function findLiveApplicationIds(
  journeyIds: Types.ObjectId[],
): Promise<Types.ObjectId[]> {
  if (journeyIds.length === 0) return [];
  const rows = await Application.find({ journeyId: { $in: journeyIds }, deletedAt: null })
    .select('_id')
    .lean();
  return rows.map((r) => r._id as Types.ObjectId);
}
