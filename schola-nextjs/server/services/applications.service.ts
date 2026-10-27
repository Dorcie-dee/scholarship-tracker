import { Types, type FilterQuery, type HydratedDocument } from 'mongoose';
import { Application, type ApplicationDoc } from '../models/application.model';
import { ApplicationJourney, type ApplicationJourneyDoc } from '../models/application-journey.model';
import { ApplicationDocument, type ApplicationDocumentDoc } from '../models/application-document.model';
import { ApplicationSnapshot, type ApplicationSnapshotDoc } from '../models/application-snapshot.model';
import { Requirement } from '../models/requirement.model';
import { Task } from '../models/task.model';
import { Deadline } from '../models/deadline.model';
import { Document as DocumentModel } from '../models/document.model';
import { getJourneyOwnedOrThrow } from './journeys.service';
import { getProfile } from './profile.service';
import { getOpportunityOrThrow } from './opportunities.service';
import { withTransaction } from '../lib/db';
import { getConfig } from '../lib/config';
import { BadRequestError, ConflictError, NotFoundError } from '../lib/http-errors';
import { paginate, type PaginatedResult } from '../lib/pagination';
import { RequirementStatus, SnapshotCreatedVia } from '../lib/enums';
import { isValidObjectId } from '../validation/common';
import type {
  AttachDocumentInput,
} from '../validation/application-documents';
import type {
  CreateApplicationSnapshotInput,
  EditApplicationSnapshotInput,
} from '../validation/application-snapshots';
import type {
  CreateApplicationInput,
  ListApplicationsQuery,
  UpdateApplicationInput,
} from '../validation/applications';

export type ApplicationDocumentRecord = HydratedDocument<ApplicationDoc>;
export type ApplicationSnapshotRecord = HydratedDocument<ApplicationSnapshotDoc>;

const MONGO_DUPLICATE_KEY_ERROR_CODE = 11000;

/**
 * Ported from `applications/applications.service.ts`,
 * `application-documents.service.ts`, `application-snapshots.service.ts`,
 * and `application-purge.service.ts`. Every Application read path filters
 * `deletedAt: null` explicitly — Mongoose has no automatic equivalent of
 * TypeORM's `@DeleteDateColumn` query exclusion (see `application.model.ts`'s
 * doc comment and `docs/decisions.md`, "Track 2, §0").
 */
function assertOwnership(resourceUserId: Types.ObjectId, currentUserId: string): void {
  if (String(resourceUserId) !== String(currentUserId)) {
    throw new NotFoundError('Application not found');
  }
}

function assertValidObjectId(id: string, message: string): void {
  if (!isValidObjectId(id)) {
    throw new NotFoundError(message);
  }
}

/** Loads a LIVE (not soft-deleted) Application + its owning Journey, or 404s. */
async function findLiveApplicationWithJourney(
  id: string,
): Promise<{ application: ApplicationDocumentRecord; journey: HydratedDocument<ApplicationJourneyDoc> }> {
  assertValidObjectId(id, 'Application not found');
  const application = await Application.findOne({ _id: id, deletedAt: null });
  if (!application) {
    throw new NotFoundError('Application not found');
  }
  const journey = await ApplicationJourney.findById(application.journeyId);
  if (!journey) {
    throw new NotFoundError('Application not found');
  }
  return { application, journey };
}

export async function getApplicationOwnedOrThrow(
  id: string,
  userId: string,
): Promise<ApplicationDocumentRecord> {
  const { application, journey } = await findLiveApplicationWithJourney(id);
  assertOwnership(journey.userId, userId);
  return application;
}

/** Used by sibling modules (requirements/tasks/deadlines, ported separately) to verify ownership by applicationId only. */
export async function assertApplicationOwnedByUser(applicationId: string, userId: string): Promise<void> {
  await getApplicationOwnedOrThrow(applicationId, userId);
}

/**
 * Track 1 Group C / I6 — creates the Application and, if it's linked to an
 * Opportunity that has requirements, copies each one into a new, independent
 * Application-scoped Requirement row (never a live link — see
 * `requirement.model.ts`'s `copiedFromRequirementId` doc comment). A
 * one-time copy, not synchronization — later changes to the Opportunity's
 * requirements never alter what was already copied, and this is never
 * re-triggered by a later `PATCH` that changes `opportunityId`.
 *
 * The Opportunity's requirements are read BEFORE opening the transaction
 * (see `docs/decisions.md`, "Opportunity → Application Requirement copy") —
 * the transaction itself contains exactly the two writes that must succeed
 * or fail together: the Application insert and the Requirement-copy inserts.
 */
export async function createApplication(
  userId: string,
  dto: CreateApplicationInput,
): Promise<ApplicationDocumentRecord> {
  // Independent checks — neither depends on the other's result — run concurrently.
  const [journey, opportunity] = await Promise.all([
    getJourneyOwnedOrThrow(dto.journeyId, userId),
    dto.opportunityId ? getOpportunityOrThrow(dto.opportunityId) : Promise.resolve(null),
  ]);

  const opportunityRequirements = opportunity
    ? await Requirement.find({ opportunityId: opportunity._id })
    : [];

  return withTransaction(async (session) => {
    const [application] = await Application.create([{ ...dto, journeyId: journey._id }], { session });

    if (opportunityRequirements.length > 0) {
      const copies = opportunityRequirements.map((source) => ({
        requirementType: source.requirementType,
        description: source.description,
        // Fresh initial status (the schema's own default), never the
        // source's current status — a requirement's satisfaction is specific
        // to THIS application, not inherited from the catalog row.
        status: RequirementStatus.UNKNOWN,
        applicationId: application._id,
        opportunityId: null,
        notes: source.notes,
        copiedFromRequirementId: source._id,
      }));
      await Requirement.create(copies, { session, ordered: true });
    }

    return application;
  });
}

/** Keyset-paginated, ordered by `(createdAt, _id)`. Still scoped through the Journey→userId chain first — pagination never loosens ownership. */
export async function listApplicationsForUser(
  userId: string,
  journeyId: string | undefined,
  query: ListApplicationsQuery,
): Promise<PaginatedResult<ApplicationDocumentRecord>> {
  const journeyFilter: FilterQuery<ApplicationJourneyDoc> = { userId };
  if (journeyId) {
    if (!isValidObjectId(journeyId)) {
      // Not a real id at all — can't match any owned journey; empty page,
      // same as the original's SQL join producing zero rows (no 404 here:
      // `journeyId` is a list filter, not a direct ownership-checked lookup).
      return { items: [], nextCursor: null, hasNextPage: false };
    }
    journeyFilter._id = journeyId;
  }

  const ownedJourneyIds = await ApplicationJourney.distinct('_id', journeyFilter);
  if (ownedJourneyIds.length === 0) {
    return { items: [], nextCursor: null, hasNextPage: false };
  }

  return paginate(Application, {
    filter: { journeyId: { $in: ownedJourneyIds }, deletedAt: null },
    sortField: 'createdAt',
    sortOrder: query.order ?? 'desc',
    cursor: query.cursor ?? null,
    limit: query.limit ?? null,
  });
}

/**
 * Track 1 Group C / I5 + C1.3 — `journeyId` is immutable after creation. A
 * resent-but-unchanged `journeyId` (the common case for a client that always
 * includes every field) is accepted as a no-op; an actual attempted change
 * is rejected with a clear 400, not silently ignored.
 */
export async function updateApplication(
  id: string,
  userId: string,
  dto: UpdateApplicationInput,
): Promise<ApplicationDocumentRecord> {
  const application = await getApplicationOwnedOrThrow(id, userId);

  if (dto.journeyId !== undefined && dto.journeyId !== String(application.journeyId)) {
    throw new BadRequestError('journeyId cannot be changed after an Application is created');
  }

  if (dto.opportunityId) {
    await getOpportunityOrThrow(dto.opportunityId);
  }

  const { journeyId: _ignoredJourneyId, ...rest } = dto;
  Object.assign(application, rest);
  await application.save();
  return application;
}

/**
 * Soft-delete (Production hardening Batch 7) — see `application.model.ts`'s
 * doc comment on `deletedAt`. Permanently removed later by
 * `purgeExpiredApplications()` once the retention window has passed.
 */
export async function softDeleteApplication(id: string, userId: string): Promise<void> {
  const application = await getApplicationOwnedOrThrow(id, userId);
  application.deletedAt = new Date();
  await application.save();
}

/**
 * Owner-only restore of a soft-deleted Application. Children were never
 * soft-deleted independently — clearing `deletedAt` re-exposes them through
 * existing visibility filters. After permanent purge the row is gone → 404.
 */
export async function restoreApplication(
  id: string,
  userId: string,
): Promise<ApplicationDocumentRecord> {
  assertValidObjectId(id, 'Application not found');
  const application = await Application.findById(id); // intentionally no deletedAt filter — restore must see soft-deleted rows
  if (!application) {
    throw new NotFoundError('Application not found');
  }
  const journey = await ApplicationJourney.findById(application.journeyId);
  if (!journey) {
    throw new NotFoundError('Application not found');
  }
  // Same 404 convention as live lookups — do not reveal another user's deleted row.
  assertOwnership(journey.userId, userId);

  if (application.deletedAt === null) {
    throw new ConflictError('Application is not deleted');
  }

  application.deletedAt = null;
  await application.save();
  return application;
}

/**
 * The other half of Application's soft-delete — permanently removes rows
 * whose retention window has passed, cascading to Tasks/Requirements/
 * Deadlines/ApplicationDocuments/ApplicationSnapshots (NOT the underlying
 * Documents themselves — only the join rows). Exported for
 * `server/scripts/purge-applications.ts`'s CLI entry point (no HTTP route —
 * a future scheduled trigger calls this directly).
 */
export async function purgeExpiredApplications(): Promise<number> {
  const { softDeleteRetentionDays } = getConfig().applications;
  const cutoff = new Date(Date.now() - softDeleteRetentionDays * 24 * 60 * 60 * 1000);

  const expired = await Application.find({ deletedAt: { $ne: null, $lt: cutoff } }).select('_id');
  if (expired.length === 0) {
    return 0;
  }
  const ids = expired.map((doc) => doc._id);

  await withTransaction(async (session) => {
    await Promise.all([
      Task.deleteMany({ applicationId: { $in: ids } }).session(session),
      Requirement.deleteMany({ applicationId: { $in: ids } }).session(session),
      Deadline.deleteMany({ applicationId: { $in: ids } }).session(session),
      ApplicationDocument.deleteMany({ applicationId: { $in: ids } }).session(session),
      ApplicationSnapshot.deleteMany({ applicationId: { $in: ids } }).session(session),
    ]);
    await Application.deleteMany({ _id: { $in: ids } }).session(session);
  });

  return ids.length;
}

// ---------------------------------------------------------------------------
// Attached documents — /applications/:id/documents
// ---------------------------------------------------------------------------

/**
 * Pins an EXACT Document version to an Application. Both ownership checks
 * (Application via the Journey chain, Document via `ownerId`) are scoped to
 * the same caller, so there's no path to attach someone else's document, or
 * attach to someone else's application, even by guessing a valid id.
 * Duplicate attachment is guarded by the unique (applicationId, documentId)
 * index alone — no upfront existence check — same reasoning as the original:
 * a pre-check would add a round trip and still not close the race window a
 * unique index closes for free.
 */
export async function attachDocument(
  userId: string,
  applicationId: string,
  dto: AttachDocumentInput,
): Promise<HydratedDocument<ApplicationDocumentDoc>> {
  const [application, document] = await Promise.all([
    getApplicationOwnedOrThrow(applicationId, userId),
    DocumentModel.findOne({ _id: dto.documentId, ownerId: userId }),
  ]);
  if (!document) {
    throw new NotFoundError('Document not found');
  }

  try {
    return await ApplicationDocument.create({
      applicationId: application._id,
      documentId: document._id,
      label: dto.label ?? null,
      attachedAt: new Date(),
    });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: number }).code === MONGO_DUPLICATE_KEY_ERROR_CODE
    ) {
      throw new ConflictError('This exact document version is already attached to this application');
    }
    throw error;
  }
}

/**
 * Lists an application's attached documents with their exact pinned
 * versions, oldest attachment first. Returned as plain serializable objects
 * (via each document's own `toJSON()` transform) rather than typed records —
 * the response shape is a join projection, not a model's own doc shape.
 */
export async function listApplicationDocuments(
  userId: string,
  applicationId: string,
): Promise<Record<string, unknown>[]> {
  await getApplicationOwnedOrThrow(applicationId, userId);

  const links = await ApplicationDocument.find({ applicationId }).sort({ attachedAt: 1 });
  const documentIds = links.map((link) => link.documentId);
  const documents = await DocumentModel.find({ _id: { $in: documentIds } });
  const documentsById = new Map(documents.map((doc) => [String(doc._id), doc]));

  return links.map((link) => {
    const json = link.toJSON() as Record<string, unknown>;
    const document = documentsById.get(String(link.documentId));
    return { ...json, document: document ? document.toJSON() : null };
  });
}

/**
 * Removes ONE attachment (the join row only) — never the underlying
 * Document, never Cloudinary, never any existing ApplicationSnapshot (a
 * snapshot's `data.documents[]` is a point-in-time copy, entirely
 * independent of what is or isn't currently attached). Identified by
 * `documentId`, not the join row's own id — matches the attach endpoint's
 * own request-body field, and is unambiguous: `UNIQUE(applicationId,
 * documentId)` guarantees at most one matching row.
 */
export async function detachDocument(
  userId: string,
  applicationId: string,
  documentId: string,
): Promise<void> {
  await getApplicationOwnedOrThrow(applicationId, userId);

  const link = await ApplicationDocument.findOneAndDelete({ applicationId, documentId });
  if (!link) {
    throw new NotFoundError('This document is not attached to this application');
  }
}

// ---------------------------------------------------------------------------
// Snapshots — /applications/:id/snapshots
// ---------------------------------------------------------------------------

/**
 * Point-in-time copy of: relevant Application facts, relevant Profile
 * fields (excluding internal-only metadata), Requirement state (including
 * `requirementId` and the `copiedFromRequirementId` provenance breadcrumb —
 * a copy of that value, never a live resolution of the source row), exact
 * attached-document references (`documentId` + `version` only — never a
 * copy of the file), and written responses (always an empty array today —
 * no storage model for that exists yet). See `docs/decisions.md`,
 * "Application Snapshot creation model". `createdVia` is always server-set
 * to `manual` — never accepted from the client.
 */
export async function createSnapshot(
  userId: string,
  applicationId: string,
  dto: CreateApplicationSnapshotInput,
): Promise<ApplicationSnapshotRecord> {
  const application = await getApplicationOwnedOrThrow(applicationId, userId);

  const [attachedLinks, requirements, profile] = await Promise.all([
    ApplicationDocument.find({ applicationId }),
    Requirement.find({ applicationId }),
    getProfile(userId),
  ]);

  const documentIds = attachedLinks.map((link) => link.documentId);
  const documents = await DocumentModel.find({ _id: { $in: documentIds } }).select('_id version');
  const versionByDocumentId = new Map(documents.map((doc) => [String(doc._id), doc.version]));

  const data = {
    application: {
      status: application.status,
      applicationType: application.applicationType,
      title: application.title,
      startDate: application.startDate,
      submissionDate: application.submissionDate,
      portal: application.portal,
      externalUrl: application.externalUrl,
      notes: application.notes,
    },
    profile: {
      nationality: profile.nationality,
      dateOfBirth: profile.dateOfBirth,
      summary: profile.summary,
      education: profile.education,
      experience: profile.experience,
      skills: profile.skills,
      certifications: profile.certifications,
      languages: profile.languages,
    },
    requirements: requirements.map((requirement) => ({
      requirementId: String(requirement._id),
      requirementType: requirement.requirementType,
      description: requirement.description,
      status: requirement.status,
      notes: requirement.notes,
      copiedFromRequirementId: requirement.copiedFromRequirementId
        ? String(requirement.copiedFromRequirementId)
        : null,
    })),
    documents: attachedLinks.map((link) => ({
      documentId: String(link.documentId),
      version: versionByDocumentId.get(String(link.documentId)) ?? null,
    })),
    writtenResponses: [] as unknown[],
  };

  return ApplicationSnapshot.create({
    applicationId: application._id,
    label: dto.label ?? null,
    createdVia: SnapshotCreatedVia.MANUAL,
    data,
    supersedesSnapshotId: null,
  });
}

export async function listSnapshots(
  userId: string,
  applicationId: string,
): Promise<ApplicationSnapshotRecord[]> {
  await getApplicationOwnedOrThrow(applicationId, userId);
  return ApplicationSnapshot.find({ applicationId }).sort({ createdAt: 1 });
}

/** `404` if `snapshotId` belongs to a different Application, even one the caller owns. */
export async function getSnapshot(
  userId: string,
  applicationId: string,
  snapshotId: string,
): Promise<ApplicationSnapshotRecord> {
  await getApplicationOwnedOrThrow(applicationId, userId);
  if (!isValidObjectId(snapshotId)) {
    throw new NotFoundError('Application snapshot not found');
  }
  const snapshot = await ApplicationSnapshot.findOne({ _id: snapshotId, applicationId });
  if (!snapshot) {
    throw new NotFoundError('Application snapshot not found');
  }
  return snapshot;
}

/**
 * Append-only edit: inserts a new snapshot that supersedes `snapshotId`. The
 * previous row is never mutated. Runs inside a transaction so a concurrent
 * edit of the same source revision serializes cleanly (Mongo's transaction
 * write-conflict detection stands in for the original's pessimistic row
 * lock — stricter, not weaker).
 */
export async function createSnapshotRevision(
  userId: string,
  applicationId: string,
  snapshotId: string,
  dto: EditApplicationSnapshotInput,
): Promise<ApplicationSnapshotRecord> {
  await getApplicationOwnedOrThrow(applicationId, userId);
  if (!isValidObjectId(snapshotId)) {
    throw new NotFoundError('Application snapshot not found');
  }

  return withTransaction(async (session) => {
    const previous = await ApplicationSnapshot.findOne({ _id: snapshotId, applicationId }).session(session);
    if (!previous) {
      throw new NotFoundError('Application snapshot not found');
    }

    const [revision] = await ApplicationSnapshot.create(
      [
        {
          applicationId,
          label: dto.label !== undefined ? dto.label : previous.label,
          createdVia: SnapshotCreatedVia.MANUAL,
          data: dto.data !== undefined ? dto.data : previous.data,
          supersedesSnapshotId: previous._id,
        },
      ],
      { session },
    );
    return revision;
  });
}

/**
 * Hard-delete a snapshot owned by the user's application. Descendants that
 * supersede this row keep lineage with `supersedesSnapshotId` cleared
 * (manual equivalent of the original's `ON DELETE SET NULL` FK — Mongo has
 * no FK cascade/set-null of its own).
 */
export async function deleteSnapshot(
  userId: string,
  applicationId: string,
  snapshotId: string,
): Promise<void> {
  await getApplicationOwnedOrThrow(applicationId, userId);
  if (!isValidObjectId(snapshotId)) {
    throw new NotFoundError('Application snapshot not found');
  }

  await withTransaction(async (session) => {
    const snapshot = await ApplicationSnapshot.findOne({ _id: snapshotId, applicationId }).session(session);
    if (!snapshot) {
      throw new NotFoundError('Application snapshot not found');
    }
    await ApplicationSnapshot.deleteOne({ _id: snapshot._id }).session(session);
    await ApplicationSnapshot.updateMany(
      { supersedesSnapshotId: snapshot._id },
      { $set: { supersedesSnapshotId: null } },
    ).session(session);
  });
}
