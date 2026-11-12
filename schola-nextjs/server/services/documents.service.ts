import type { HydratedDocument } from 'mongoose';
import { Document, type DocumentDoc } from '../models/document.model';
import { ApplicationDocument } from '../models/application-document.model';
import { ApplicationSnapshot } from '../models/application-snapshot.model';
import { Application } from '../models/application.model';
import { ApplicationJourney } from '../models/application-journey.model';
import { getConfig } from '../lib/config';
import {
  deleteByPublicId,
  getSignedDeliveryUrl,
  uploadBuffer,
} from '../lib/cloudinary';
import { withTransaction } from '../lib/db';
import { ConflictError, NotFoundError } from '../lib/http-errors';
import { paginate, type PaginatedResult } from '../lib/pagination';
import { assertValidObjectId } from './access';
import { validateUploadedFile } from '../validation/documents';
import type {
  DocumentMetadataInput,
  DocumentVersionMetadataInput,
  UpdateDocumentInput,
} from '../validation/documents';

type HydratedDoc = HydratedDocument<DocumentDoc>;

export interface UploadFileInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * Ported from `documents/documents.service.ts`. Documents are owned
 * directly by `ownerId` (no Journey indirection, unlike Tasks/Deadlines/
 * Requirements).
 */

async function findOwnedDocumentOrThrow(id: string, ownerId: string): Promise<HydratedDoc> {
  assertValidObjectId(id, 'Document');
  const document = await Document.findById(id);
  if (!document || String(document.ownerId) !== ownerId) {
    throw new NotFoundError('Document not found');
  }
  return document as HydratedDoc;
}

export { findOwnedDocumentOrThrow };

/**
 * `cloudinaryResourceType` is nullable only for rows written before that
 * column existed — fall back to inferring from `mimeType`.
 */
function resolveResourceType(
  document: Pick<DocumentDoc, 'cloudinaryResourceType' | 'mimeType'>,
): 'image' | 'raw' | 'video' {
  if (document.cloudinaryResourceType === 'image') return 'image';
  if (document.cloudinaryResourceType === 'video') return 'video';
  if (document.cloudinaryResourceType === 'raw') return 'raw';
  return document.mimeType?.startsWith('image/') ? 'image' : 'raw';
}

/**
 * Production hardening (Batch 6) parity — compensating action for an
 * upload-then-persist failure: the Cloudinary asset was created
 * successfully, but the DB write that was supposed to record it never
 * committed, so it's an orphan (never referenced by any Document row,
 * never resolvable to any user) unless something removes it. Best-effort,
 * synchronous — not a transactional outbox. See `docs/decisions.md`,
 * "Cloudinary orphan handling: compensating delete, not an outbox".
 */
async function compensateFailedUpload(
  publicId: string,
  resourceType: 'image' | 'raw' | 'video',
): Promise<void> {
  try {
    await deleteByPublicId(publicId, resourceType);
  } catch (cleanupError) {
    // eslint-disable-next-line no-console
    console.error(
      `Cloudinary asset orphaned after a failed document save: publicId=${publicId}. ` +
        `The upload succeeded but no Document row references it, and the compensating delete also ` +
        `failed. Manual cleanup may be required. Underlying error: ` +
        `${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
    );
  }
}

export async function uploadNewDocument(
  ownerId: string,
  metadata: DocumentMetadataInput,
  file: UploadFileInput,
): Promise<HydratedDoc> {
  validateUploadedFile(file.buffer, file.mimeType, getConfig().documents.allowedMimeTypes);

  const uploaded = await uploadBuffer(file.buffer, {
    folder: `scholarship-os/${ownerId}/documents`,
    filename: file.filename,
  });

  try {
    return await Document.create({
      ownerId,
      title: metadata.title,
      documentType: metadata.documentType,
      notes: metadata.notes ?? null,
      version: 1,
      previousVersionId: null,
      cloudinaryPublicId: uploaded.publicId,
      cloudinaryUrl: uploaded.secureUrl,
      cloudinaryResourceType: uploaded.resourceType,
      mimeType: file.mimeType,
      fileSizeBytes: file.size,
      isCurrent: true,
    });
  } catch (error) {
    await compensateFailedUpload(uploaded.publicId, uploaded.resourceType as 'image' | 'raw' | 'video');
    throw error;
  }
}

/**
 * Uploads a new version of an existing Document. The previous version row is
 * kept as-is (`isCurrent: false`) — never mutated or deleted.
 *
 * Race-safety (Track 1 Group D / D1 parity): the version-determining
 * read-and-flip is one atomic `findOneAndUpdate` conditioned on
 * `isCurrent: true` (Mongo's equivalent of `SELECT ... FOR UPDATE` +
 * re-check), run inside a transaction alongside the new version's insert so
 * the two either both commit or neither does. If two concurrent calls target
 * the same document, only one `findOneAndUpdate` can match `isCurrent: true`
 * — the loser gets a clean 409, never a duplicate-numbered sibling.
 */
export async function uploadNewVersion(
  ownerId: string,
  documentId: string,
  file: UploadFileInput,
  metadata: DocumentVersionMetadataInput,
): Promise<HydratedDoc> {
  // Fast-fail ownership check before the expensive external upload call.
  await findOwnedDocumentOrThrow(documentId, ownerId);

  validateUploadedFile(file.buffer, file.mimeType, getConfig().documents.allowedMimeTypes);

  const uploaded = await uploadBuffer(file.buffer, {
    folder: `scholarship-os/${ownerId}/documents`,
    filename: file.filename,
  });

  try {
    return await withTransaction(async (session) => {
      const locked = await Document.findOneAndUpdate(
        { _id: documentId, ownerId, isCurrent: true },
        { $set: { isCurrent: false } },
        { new: false, session },
      );
      if (!locked) {
        const existing = await Document.findById(documentId).session(session);
        if (!existing || String(existing.ownerId) !== ownerId) {
          throw new NotFoundError('Document not found');
        }
        throw new ConflictError(
          'This document has already been superseded by a newer version — refresh and try again',
        );
      }

      const [next] = await Document.create(
        [
          {
            ownerId,
            title: metadata.title ?? locked.title,
            documentType: metadata.documentType ?? locked.documentType,
            notes: metadata.notes ?? locked.notes,
            version: locked.version + 1,
            previousVersionId: locked._id,
            cloudinaryPublicId: uploaded.publicId,
            cloudinaryUrl: uploaded.secureUrl,
            cloudinaryResourceType: uploaded.resourceType,
            mimeType: file.mimeType,
            fileSizeBytes: file.size,
            isCurrent: true,
          },
        ],
        { session },
      );
      return next;
    });
  } catch (error) {
    // Covers both a raw DB failure and this function's own
    // Conflict/NotFound (the transaction rolled back either way, so the
    // newly-uploaded asset is unreferenced regardless of which caused it).
    await compensateFailedUpload(uploaded.publicId, uploaded.resourceType as 'image' | 'raw' | 'video');
    throw error;
  }
}

/** Lists only the current version of each of the user's documents. */
export async function listCurrentDocuments(
  ownerId: string,
  query: { cursor?: string | null; limit?: string | number | null; order?: 'asc' | 'desc' },
): Promise<PaginatedResult<HydratedDoc>> {
  return paginate(Document, {
    filter: { ownerId, isCurrent: true },
    sortField: 'createdAt',
    sortOrder: query.order === 'asc' ? 'asc' : 'desc',
    cursor: query.cursor,
    limit: query.limit,
  }) as Promise<PaginatedResult<HydratedDoc>>;
}

/**
 * Full version history for one logical document, oldest first. Walks the
 * `previousVersionId` chain BACKWARD from `documentId` only (ancestors) —
 * matching the original's recursive CTE exactly (it starts at the given id
 * and recurses only through `previousVersionId`, never forward to newer
 * versions). Fetches every Document this owner has in one query, then walks
 * the chain in memory via a Map — one round trip, not `1 + N`.
 */
export async function findVersionHistory(
  ownerId: string,
  documentId: string,
): Promise<HydratedDoc[]> {
  await findOwnedDocumentOrThrow(documentId, ownerId);

  const owned = await Document.find({ ownerId });
  const byId = new Map(owned.map((d) => [String(d._id), d]));

  const chain: HydratedDoc[] = [];
  let currentId: string | undefined = documentId;
  while (currentId) {
    const doc = byId.get(currentId);
    if (!doc) break;
    chain.unshift(doc);
    currentId = doc.previousVersionId ? String(doc.previousVersionId) : undefined;
  }
  return chain;
}

/**
 * Whether `documentId` appears in any of this owner's existing
 * `ApplicationSnapshot.data.documents[]` arrays — scoped through
 * Application -> ApplicationJourney -> userId so this can never probe
 * another user's snapshot contents. Deliberately unconditional on
 * Application.deletedAt (matching the original): historical-integrity
 * protection must still hold even for a soft-deleted Application's
 * snapshots, since they aren't purged until the retention window elapses.
 */
async function isReferencedInAnySnapshot(documentId: string, ownerId: string): Promise<boolean> {
  const journeyIds = (await ApplicationJourney.find({ userId: ownerId }).select('_id').lean()).map(
    (j) => j._id,
  );
  if (journeyIds.length === 0) return false;

  const applicationIds = (
    await Application.find({ journeyId: { $in: journeyIds } }).select('_id').lean()
  ).map((a) => a._id);
  if (applicationIds.length === 0) return false;

  const match = await ApplicationSnapshot.exists({
    applicationId: { $in: applicationIds },
    'data.documents': { $elemMatch: { documentId } },
  });
  return Boolean(match);
}

export async function getSignedDownloadUrl(
  id: string,
  ownerId: string,
): Promise<{ url: string; expiresInSeconds: number }> {
  const document = await findOwnedDocumentOrThrow(id, ownerId);
  const { signedUrlTtlSeconds } = getConfig().documents;
  const url = getSignedDeliveryUrl(document.cloudinaryPublicId, resolveResourceType(document));
  return { url, expiresInSeconds: signedUrlTtlSeconds };
}

export async function updateDocument(
  id: string,
  ownerId: string,
  input: UpdateDocumentInput,
): Promise<HydratedDoc> {
  const document = await findOwnedDocumentOrThrow(id, ownerId);
  Object.assign(document, input);
  return document.save();
}

/**
 * Deletes one Document version. Order of operations (Track 1 Group D parity
 * — see `docs/decisions.md`, "Cloudinary deletion ordering"): ownership
 * check, three independent eligibility checks (each a clean 409, never a
 * raw DB error), delete the DB row FIRST (promoting the previous version to
 * current in the same transaction if applicable), and only THEN attempt the
 * irreversible Cloudinary delete — never the other way around, since a
 * Cloudinary-first delete could destroy the real file even when the DB
 * would have rejected the row delete.
 */
export async function removeDocument(id: string, ownerId: string): Promise<void> {
  const document = await findOwnedDocumentOrThrow(id, ownerId);

  const [attachedElsewhere, referencedInSnapshot, dependentChild] = await Promise.all([
    ApplicationDocument.exists({ documentId: id }),
    isReferencedInAnySnapshot(id, ownerId),
    Document.exists({ previousVersionId: id }),
  ]);

  if (attachedElsewhere) {
    throw new ConflictError(
      'Cannot delete a document version that is currently attached to an application — detach it first',
    );
  }
  if (referencedInSnapshot) {
    throw new ConflictError(
      'Cannot delete a document version that is referenced by an existing application snapshot',
    );
  }
  if (dependentChild) {
    throw new ConflictError('Cannot delete a document version that a newer version depends on');
  }

  const wasCurrent = document.isCurrent;
  const previousVersionId = document.previousVersionId;

  await withTransaction(async (session) => {
    await Document.deleteOne({ _id: id }, { session });
    if (wasCurrent && previousVersionId) {
      await Document.updateOne({ _id: previousVersionId }, { $set: { isCurrent: true } }, { session });
    }
  });

  // Only now — after the DB deletion has committed — attempt the
  // irreversible Cloudinary delete. A failure here never undoes the DB
  // deletion; it only leaves an orphaned Cloudinary asset, logged for
  // operational follow-up.
  try {
    await deleteByPublicId(document.cloudinaryPublicId, resolveResourceType(document));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `Cloudinary asset orphaned after deleting Document ${id}: publicId=${document.cloudinaryPublicId}. ` +
        `The database row is gone; the Cloudinary asset was not. Manual cleanup may be required. ` +
        `Underlying error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
