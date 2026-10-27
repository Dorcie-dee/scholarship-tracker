import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { Document as DocumentModel } from '../../models/document.model';
import { ApplicationDocument } from '../../models/application-document.model';
import { ApplicationSnapshot } from '../../models/application-snapshot.model';
import { DocumentType, SnapshotCreatedVia } from '../../lib/enums';
import { ConflictError, NotFoundError } from '../../lib/http-errors';
import { createJourney } from '../journeys.service';
import { createApplication } from '../applications.service';

// Real Cloudinary calls are network I/O — mocked here so these tests never
// talk to a real account. See `server/lib/cloudinary.ts`.
vi.mock('../../lib/cloudinary', () => ({
  uploadBuffer: vi.fn(),
  deleteByPublicId: vi.fn(),
  getSignedDeliveryUrl: vi.fn(),
}));

import { deleteByPublicId, getSignedDeliveryUrl, uploadBuffer } from '../../lib/cloudinary';
import {
  findOwnedDocumentOrThrow,
  findVersionHistory,
  getSignedDownloadUrl,
  removeDocument,
  uploadNewDocument,
  uploadNewVersion,
  type UploadFileInput,
} from '../documents.service';

const mockedUploadBuffer = vi.mocked(uploadBuffer);
const mockedDeleteByPublicId = vi.mocked(deleteByPublicId);
const mockedGetSignedDeliveryUrl = vi.mocked(getSignedDeliveryUrl);

const userId = new Types.ObjectId().toString();
const otherUserId = new Types.ObjectId().toString();

let uploadCounter = 0;

function fakeFile(overrides: Partial<UploadFileInput> = {}): UploadFileInput {
  return {
    buffer: Buffer.from('%PDF-1.4 fake pdf content'),
    filename: 'file.pdf',
    mimeType: 'application/pdf',
    size: 42,
    ...overrides,
  };
}

async function makeApplication(ownerId = userId) {
  const journey = await createJourney(ownerId, { title: 'MSc Computer Science' });
  return createApplication(ownerId, { journeyId: String(journey._id), title: 'App' });
}

describe('documents.service', () => {
  beforeEach(() => {
    uploadCounter = 0;
    mockedUploadBuffer.mockReset();
    mockedDeleteByPublicId.mockReset();
    mockedGetSignedDeliveryUrl.mockReset();
    mockedUploadBuffer.mockImplementation(async () => {
      uploadCounter += 1;
      return {
        publicId: `pub-${uploadCounter}`,
        url: `http://cloudinary.test/${uploadCounter}`,
        secureUrl: `https://cloudinary.test/${uploadCounter}`,
        bytes: 42,
        format: 'pdf',
        resourceType: 'raw',
      };
    });
    mockedDeleteByPublicId.mockResolvedValue(undefined);
    mockedGetSignedDeliveryUrl.mockReturnValue('https://cloudinary.test/signed');
  });

  describe('version-chain correctness', () => {
    it('v1 has no previousVersionId and is current', async () => {
      const v1 = await uploadNewDocument(userId, { title: 'CV', documentType: DocumentType.CV }, fakeFile());
      expect(v1.version).toBe(1);
      expect(v1.previousVersionId).toBeNull();
      expect(v1.isCurrent).toBe(true);
    });

    it('uploading a new version flips isCurrent and links previousVersionId', async () => {
      const v1 = await uploadNewDocument(userId, { title: 'CV', documentType: DocumentType.CV }, fakeFile());
      const v2 = await uploadNewVersion(userId, String(v1._id), fakeFile(), {});

      expect(v2.version).toBe(2);
      expect(String(v2.previousVersionId)).toBe(String(v1._id));
      expect(v2.isCurrent).toBe(true);

      const reloadedV1 = await DocumentModel.findById(v1._id);
      expect(reloadedV1!.isCurrent).toBe(false);
    });

    it('a third version chains onto the second, not the first', async () => {
      const v1 = await uploadNewDocument(userId, { title: 'CV', documentType: DocumentType.CV }, fakeFile());
      const v2 = await uploadNewVersion(userId, String(v1._id), fakeFile(), {});
      const v3 = await uploadNewVersion(userId, String(v2._id), fakeFile(), {});

      expect(String(v3.previousVersionId)).toBe(String(v2._id));
      expect(v3.version).toBe(3);

      const history = await findVersionHistory(userId, String(v3._id));
      expect(history.map((d) => String(d._id))).toEqual([String(v1._id), String(v2._id), String(v3._id)]);
    });

    it('new version metadata falls back to the previous version when omitted', async () => {
      const v1 = await uploadNewDocument(
        userId,
        { title: 'CV', documentType: DocumentType.CV, notes: 'original note' },
        fakeFile(),
      );
      const v2 = await uploadNewVersion(userId, String(v1._id), fakeFile(), {});
      expect(v2.title).toBe('CV');
      expect(v2.documentType).toBe(DocumentType.CV);
      expect(v2.notes).toBe('original note');
    });
  });

  describe('race-safety on concurrent version uploads', () => {
    it('exactly one of two concurrent uploadNewVersion calls succeeds; the other gets a clean 409', async () => {
      const v1 = await uploadNewDocument(userId, { title: 'CV', documentType: DocumentType.CV }, fakeFile());

      const results = await Promise.allSettled([
        uploadNewVersion(userId, String(v1._id), fakeFile(), {}),
        uploadNewVersion(userId, String(v1._id), fakeFile(), {}),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictError);

      // The chain is not corrupted: exactly one v2 exists, chained onto v1.
      const allForOwner = await DocumentModel.find({ ownerId: userId }).sort({ version: 1 });
      expect(allForOwner).toHaveLength(2);
      expect(allForOwner[1].version).toBe(2);
      expect(String(allForOwner[1].previousVersionId)).toBe(String(v1._id));

      // The loser's uploaded Cloudinary asset was compensated (deleted), not orphaned silently.
      expect(mockedDeleteByPublicId).toHaveBeenCalledTimes(1);
    });
  });

  describe('deletion-eligibility checks', () => {
    it('cannot delete a version currently attached to an Application', async () => {
      const application = await makeApplication();
      const document = await uploadNewDocument(
        userId,
        { title: 'CV', documentType: DocumentType.CV },
        fakeFile(),
      );
      await ApplicationDocument.create({
        applicationId: application._id,
        documentId: document._id,
        attachedAt: new Date(),
      });

      await expect(removeDocument(String(document._id), userId)).rejects.toThrow(ConflictError);
      expect(mockedDeleteByPublicId).not.toHaveBeenCalled();
    });

    it('cannot delete a version referenced by an existing Application snapshot', async () => {
      const application = await makeApplication();
      const document = await uploadNewDocument(
        userId,
        { title: 'CV', documentType: DocumentType.CV },
        fakeFile(),
      );
      await ApplicationSnapshot.create({
        applicationId: application._id,
        createdVia: SnapshotCreatedVia.MANUAL,
        data: { documents: [{ documentId: String(document._id), version: 1 }] },
      });

      await expect(removeDocument(String(document._id), userId)).rejects.toThrow(ConflictError);
    });

    it('cannot delete a version that a newer version depends on', async () => {
      const v1 = await uploadNewDocument(userId, { title: 'CV', documentType: DocumentType.CV }, fakeFile());
      await uploadNewVersion(userId, String(v1._id), fakeFile(), {});

      await expect(removeDocument(String(v1._id), userId)).rejects.toThrow(ConflictError);
    });

    it('deletes a leaf version and promotes the previous version back to current', async () => {
      const v1 = await uploadNewDocument(userId, { title: 'CV', documentType: DocumentType.CV }, fakeFile());
      const v2 = await uploadNewVersion(userId, String(v1._id), fakeFile(), {});

      await removeDocument(String(v2._id), userId);

      expect(await DocumentModel.findById(v2._id)).toBeNull();
      const reloadedV1 = await DocumentModel.findById(v1._id);
      expect(reloadedV1!.isCurrent).toBe(true);
      expect(mockedDeleteByPublicId).toHaveBeenCalledWith(v2.cloudinaryPublicId, expect.any(String));
    });

    it('404s deleting a document owned by another user', async () => {
      const document = await uploadNewDocument(
        otherUserId,
        { title: 'CV', documentType: DocumentType.CV },
        fakeFile(),
      );
      await expect(removeDocument(String(document._id), userId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('ownership', () => {
    it('404s fetching a document owned by another user', async () => {
      const document = await uploadNewDocument(
        otherUserId,
        { title: 'CV', documentType: DocumentType.CV },
        fakeFile(),
      );
      await expect(findOwnedDocumentOrThrow(String(document._id), userId)).rejects.toThrow(NotFoundError);
    });

    it('getSignedDownloadUrl returns a signed url + ttl for an owned document', async () => {
      const document = await uploadNewDocument(
        userId,
        { title: 'CV', documentType: DocumentType.CV },
        fakeFile(),
      );
      const result = await getSignedDownloadUrl(String(document._id), userId);
      expect(result.url).toBe('https://cloudinary.test/signed');
      expect(result.expiresInSeconds).toBeGreaterThan(0);
    });
  });
});
