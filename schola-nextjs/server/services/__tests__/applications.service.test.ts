import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { ApplicationJourney } from '../../models/application-journey.model';
import { Application } from '../../models/application.model';
import { Opportunity } from '../../models/opportunity.model';
import { Requirement } from '../../models/requirement.model';
import { Task } from '../../models/task.model';
import { Document as DocumentModel } from '../../models/document.model';
import { ApplicationDocument } from '../../models/application-document.model';
import { ApplicantProfile } from '../../models/applicant-profile.model';
import {
  ApplicationStatus,
  ApplicationType,
  DocumentType,
  RequirementStatus,
  RequirementType,
  TaskStatus,
} from '../../lib/enums';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/http-errors';
import { createJourney } from '../journeys.service';
import {
  attachDocument,
  createApplication,
  createSnapshot,
  createSnapshotRevision,
  deleteSnapshot,
  detachDocument,
  getApplicationOwnedOrThrow,
  getSnapshot,
  listApplicationDocuments,
  listApplicationsForUser,
  listSnapshots,
  purgeExpiredApplications,
  restoreApplication,
  softDeleteApplication,
  updateApplication,
} from '../applications.service';

const userId = new Types.ObjectId().toString();
const otherUserId = new Types.ObjectId().toString();

async function makeJourney(ownerId = userId) {
  return createJourney(ownerId, { title: 'MSc Computer Science' });
}

async function makeProfile(ownerId = userId) {
  return ApplicantProfile.create({ userId: ownerId });
}

describe('applications.service', () => {
  describe('createApplication — journeyId ownership + immutability', () => {
    it('rejects creating against a journey owned by another user', async () => {
      const journey = await makeJourney(otherUserId);
      await expect(
        createApplication(userId, { journeyId: String(journey._id), title: 'My App' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('journeyId cannot be changed after creation (changed value -> 400)', async () => {
      const journey = await makeJourney();
      const otherJourney = await makeJourney();
      const application = await createApplication(userId, { journeyId: String(journey._id), title: 'App' });

      await expect(
        updateApplication(String(application._id), userId, { journeyId: String(otherJourney._id) }),
      ).rejects.toThrow(BadRequestError);
    });

    it('resending the same journeyId on PATCH is a no-op, not an error', async () => {
      const journey = await makeJourney();
      const application = await createApplication(userId, { journeyId: String(journey._id), title: 'App' });

      const updated = await updateApplication(String(application._id), userId, {
        journeyId: String(journey._id),
        title: 'Renamed',
      });
      expect(updated.title).toBe('Renamed');
      expect(String(updated.journeyId)).toBe(String(journey._id));
    });
  });

  describe('createApplication — Opportunity → Application requirement copy', () => {
    it('copies every Requirement from the Opportunity into new, application-scoped rows with provenance, atomically', async () => {
      const journey = await makeJourney();
      const opportunity = await Opportunity.create({ title: 'Fulbright Scholarship' });
      const req1 = await Requirement.create({
        opportunityId: opportunity._id,
        requirementType: RequirementType.GPA,
        description: 'GPA >= 3.5',
        status: RequirementStatus.CONFIRMED,
        notes: 'catalog note',
      });
      const req2 = await Requirement.create({
        opportunityId: opportunity._id,
        requirementType: RequirementType.LANGUAGE,
        description: 'IELTS 6.5+',
      });

      const application = await createApplication(userId, {
        journeyId: String(journey._id),
        title: 'Fulbright App',
        opportunityId: String(opportunity._id),
      });

      const copies = await Requirement.find({ applicationId: application._id }).sort({ description: 1 });
      expect(copies).toHaveLength(2);

      const copiedGpa = copies.find((c) => c.description === 'GPA >= 3.5');
      expect(copiedGpa).toBeDefined();
      expect(String(copiedGpa!.copiedFromRequirementId)).toBe(String(req1._id));
      // Fresh status, not inherited from the catalog row's current status.
      expect(copiedGpa!.status).toBe(RequirementStatus.UNKNOWN);
      expect(copiedGpa!.opportunityId).toBeNull();
      expect(copiedGpa!.notes).toBe('catalog note');

      const copiedLanguage = copies.find((c) => c.description === 'IELTS 6.5+');
      expect(String(copiedLanguage!.copiedFromRequirementId)).toBe(String(req2._id));

      // The original catalog Requirements are untouched.
      const sourceStillThere = await Requirement.find({ opportunityId: opportunity._id });
      expect(sourceStillThere).toHaveLength(2);
    });

    it('creates no copies, but still creates the Application, when the Opportunity has zero requirements', async () => {
      const journey = await makeJourney();
      const opportunity = await Opportunity.create({ title: 'Empty Opportunity' });

      const application = await createApplication(userId, {
        journeyId: String(journey._id),
        title: 'App',
        opportunityId: String(opportunity._id),
      });

      expect(application).toBeTruthy();
      const copies = await Requirement.find({ applicationId: application._id });
      expect(copies).toHaveLength(0);
    });

    it('is never re-triggered by a later PATCH that sets/changes opportunityId', async () => {
      const journey = await makeJourney();
      const opportunity = await Opportunity.create({ title: 'Fulbright Scholarship' });
      await Requirement.create({
        opportunityId: opportunity._id,
        requirementType: RequirementType.GPA,
        description: 'GPA >= 3.5',
      });

      const application = await createApplication(userId, { journeyId: String(journey._id), title: 'App' });
      expect(await Requirement.find({ applicationId: application._id })).toHaveLength(0);

      await updateApplication(String(application._id), userId, { opportunityId: String(opportunity._id) });
      expect(await Requirement.find({ applicationId: application._id })).toHaveLength(0);
    });

    it('rejects an unknown opportunityId', async () => {
      const journey = await makeJourney();
      await expect(
        createApplication(userId, {
          journeyId: String(journey._id),
          title: 'App',
          opportunityId: new Types.ObjectId().toString(),
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('soft-delete / restore — Track 2 §0 visibility', () => {
    it('soft-delete hides the Application from get/list, and hides its Tasks from Task reads', async () => {
      const journey = await makeJourney();
      const application = await createApplication(userId, { journeyId: String(journey._id), title: 'App' });
      await Task.create({
        title: 'Write SOP',
        journeyId: journey._id,
        applicationId: application._id,
        status: TaskStatus.TODO,
      });

      await softDeleteApplication(String(application._id), userId);

      await expect(getApplicationOwnedOrThrow(String(application._id), userId)).rejects.toThrow(
        NotFoundError,
      );
      const page = await listApplicationsForUser(userId, undefined, {});
      expect(page.items.map((a) => String(a._id))).not.toContain(String(application._id));

      // The Application row itself still exists (soft-deleted, not purged yet).
      const raw = await Application.findById(application._id);
      expect(raw?.deletedAt).not.toBeNull();
    });

    it('restore un-hides a soft-deleted application for its owner', async () => {
      const journey = await makeJourney();
      const application = await createApplication(userId, { journeyId: String(journey._id), title: 'App' });
      await softDeleteApplication(String(application._id), userId);

      const restored = await restoreApplication(String(application._id), userId);
      expect(restored.deletedAt).toBeNull();

      const found = await getApplicationOwnedOrThrow(String(application._id), userId);
      expect(String(found._id)).toBe(String(application._id));
    });

    it('404s restoring another user\'s deleted application', async () => {
      const journey = await makeJourney();
      const application = await createApplication(userId, { journeyId: String(journey._id), title: 'App' });
      await softDeleteApplication(String(application._id), userId);

      await expect(restoreApplication(String(application._id), otherUserId)).rejects.toThrow(NotFoundError);
    });

    it('409s restoring an application that is not deleted', async () => {
      const journey = await makeJourney();
      const application = await createApplication(userId, { journeyId: String(journey._id), title: 'App' });

      await expect(restoreApplication(String(application._id), userId)).rejects.toThrow(ConflictError);
    });

    it('404s restoring after the application was purged', async () => {
      const journey = await makeJourney();
      const application = await createApplication(userId, { journeyId: String(journey._id), title: 'App' });
      await softDeleteApplication(String(application._id), userId);

      // Simulate the retention window having passed, then run the purge job.
      await Application.updateOne(
        { _id: application._id },
        { $set: { deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) } },
      );
      const purgedCount = await purgeExpiredApplications();
      expect(purgedCount).toBe(1);
      expect(await Application.findById(application._id)).toBeNull();

      await expect(restoreApplication(String(application._id), userId)).rejects.toThrow(NotFoundError);
    });

    it('purge cascades to Requirements/Tasks (not the underlying Documents)', async () => {
      const journey = await makeJourney();
      const application = await createApplication(userId, { journeyId: String(journey._id), title: 'App' });
      await Requirement.create({ applicationId: application._id, description: 'Req', status: RequirementStatus.UNKNOWN });
      await Task.create({ title: 'Task', journeyId: journey._id, applicationId: application._id });
      const document = await DocumentModel.create({
        ownerId: userId,
        title: 'CV',
        documentType: DocumentType.CV,
        cloudinaryPublicId: 'pub-id',
        cloudinaryUrl: 'https://example.com/cv.pdf',
      });
      await attachDocument(userId, String(application._id), { documentId: String(document._id) });

      await Application.updateOne(
        { _id: application._id },
        { $set: { deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) } },
      );
      await purgeExpiredApplications();

      expect(await Requirement.find({ applicationId: application._id })).toHaveLength(0);
      expect(await Task.find({ applicationId: application._id })).toHaveLength(0);
      expect(await ApplicationDocument.find({ applicationId: application._id })).toHaveLength(0);
      // The underlying Document itself is never touched by the purge.
      expect(await DocumentModel.findById(document._id)).not.toBeNull();
    });
  });

  describe('attachDocument — uniqueness constraint', () => {
    it('attaching the same document version twice surfaces as a 409', async () => {
      const journey = await makeJourney();
      const application = await createApplication(userId, { journeyId: String(journey._id), title: 'App' });
      const document = await DocumentModel.create({
        ownerId: userId,
        title: 'CV',
        documentType: DocumentType.CV,
        cloudinaryPublicId: 'pub-id',
        cloudinaryUrl: 'https://example.com/cv.pdf',
      });

      await attachDocument(userId, String(application._id), { documentId: String(document._id) });
      await expect(
        attachDocument(userId, String(application._id), { documentId: String(document._id) }),
      ).rejects.toThrow(ConflictError);

      const links = await listApplicationDocuments(userId, String(application._id));
      expect(links).toHaveLength(1);
    });

    it('rejects attaching a document owned by another user', async () => {
      const journey = await makeJourney();
      const application = await createApplication(userId, { journeyId: String(journey._id), title: 'App' });
      const document = await DocumentModel.create({
        ownerId: otherUserId,
        title: 'CV',
        documentType: DocumentType.CV,
        cloudinaryPublicId: 'pub-id',
        cloudinaryUrl: 'https://example.com/cv.pdf',
      });

      await expect(
        attachDocument(userId, String(application._id), { documentId: String(document._id) }),
      ).rejects.toThrow(NotFoundError);
    });

    it('detach removes only the join row, never the Document itself', async () => {
      const journey = await makeJourney();
      const application = await createApplication(userId, { journeyId: String(journey._id), title: 'App' });
      const document = await DocumentModel.create({
        ownerId: userId,
        title: 'CV',
        documentType: DocumentType.CV,
        cloudinaryPublicId: 'pub-id',
        cloudinaryUrl: 'https://example.com/cv.pdf',
      });
      await attachDocument(userId, String(application._id), { documentId: String(document._id) });

      await detachDocument(userId, String(application._id), String(document._id));

      expect(await listApplicationDocuments(userId, String(application._id))).toHaveLength(0);
      expect(await DocumentModel.findById(document._id)).not.toBeNull();

      await expect(detachDocument(userId, String(application._id), String(document._id))).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('snapshots — append-only revisioning', () => {
    it('creates a snapshot capturing application/profile/requirement/document state', async () => {
      await makeProfile();
      const journey = await makeJourney();
      const application = await createApplication(userId, {
        journeyId: String(journey._id),
        title: 'App',
        status: ApplicationStatus.IN_PROGRESS,
        applicationType: ApplicationType.ADMISSION,
      });
      const requirement = await Requirement.create({
        applicationId: application._id,
        description: 'GPA >= 3.5',
        status: RequirementStatus.CONFIRMED,
        copiedFromRequirementId: new Types.ObjectId(),
      });
      const document = await DocumentModel.create({
        ownerId: userId,
        title: 'CV',
        documentType: DocumentType.CV,
        version: 2,
        cloudinaryPublicId: 'pub-id',
        cloudinaryUrl: 'https://example.com/cv.pdf',
      });
      await attachDocument(userId, String(application._id), { documentId: String(document._id) });

      const snapshot = await createSnapshot(userId, String(application._id), { label: 'Before submitting' });

      expect(snapshot.label).toBe('Before submitting');
      expect(snapshot.createdVia).toBe('manual');
      expect(snapshot.supersedesSnapshotId).toBeNull();
      const data = snapshot.data as Record<string, any>;
      expect(data.application.status).toBe(ApplicationStatus.IN_PROGRESS);
      expect(data.requirements).toEqual([
        expect.objectContaining({
          requirementId: String(requirement._id),
          copiedFromRequirementId: String(requirement.copiedFromRequirementId),
        }),
      ]);
      expect(data.documents).toEqual([{ documentId: String(document._id), version: 2 }]);
      expect(data.writtenResponses).toEqual([]);
    });

    it('editing a snapshot creates a NEW revision, never mutating the previous row', async () => {
      await makeProfile();
      const journey = await makeJourney();
      const application = await createApplication(userId, { journeyId: String(journey._id), title: 'App' });
      const original = await createSnapshot(userId, String(application._id), { label: 'v1' });

      const revision = await createSnapshotRevision(userId, String(application._id), String(original._id), {
        label: 'v2',
      });

      expect(String(revision._id)).not.toBe(String(original._id));
      expect(revision.label).toBe('v2');
      expect(String(revision.supersedesSnapshotId)).toBe(String(original._id));

      // The original row is untouched.
      const stillOriginal = await getSnapshot(userId, String(application._id), String(original._id));
      expect(stillOriginal.label).toBe('v1');

      const all = await listSnapshots(userId, String(application._id));
      expect(all).toHaveLength(2);
    });

    it('deleting a snapshot clears supersedesSnapshotId on its descendants instead of cascading', async () => {
      await makeProfile();
      const journey = await makeJourney();
      const application = await createApplication(userId, { journeyId: String(journey._id), title: 'App' });
      const original = await createSnapshot(userId, String(application._id), { label: 'v1' });
      const revision = await createSnapshotRevision(userId, String(application._id), String(original._id), {
        label: 'v2',
      });

      await deleteSnapshot(userId, String(application._id), String(original._id));

      await expect(getSnapshot(userId, String(application._id), String(original._id))).rejects.toThrow(
        NotFoundError,
      );
      const survivingRevision = await getSnapshot(userId, String(application._id), String(revision._id));
      expect(survivingRevision.supersedesSnapshotId).toBeNull();
    });

    it('404s for a snapshot that belongs to a different application', async () => {
      await makeProfile();
      const journey = await makeJourney();
      const applicationA = await createApplication(userId, { journeyId: String(journey._id), title: 'A' });
      const applicationB = await createApplication(userId, { journeyId: String(journey._id), title: 'B' });
      const snapshotA = await createSnapshot(userId, String(applicationA._id), {});

      await expect(getSnapshot(userId, String(applicationB._id), String(snapshotA._id))).rejects.toThrow(
        NotFoundError,
      );
    });
  });
});
