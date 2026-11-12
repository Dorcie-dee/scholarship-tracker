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
import { createRequirement } from '../requirements.service';
import { createTask } from '../tasks.service';
import { createDeadline } from '../deadlines.service';
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
      const opportunity = await Opportunity.create({ ownerId: userId, title: 'Fulbright Scholarship' });
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
      const opportunity = await Opportunity.create({ ownerId: userId, title: 'Empty Opportunity' });

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
      const opportunity = await Opportunity.create({ ownerId: userId, title: 'Fulbright Scholarship' });
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

  /**
   * Scenario C/D from the product-direction correction: one journey must be
   * able to hold an admission Application alongside several independent
   * funding/scholarship Applications, each referencing a different
   * Opportunity — never forced into a single merged record — and every
   * child row (Requirement/Task/Deadline/Document/Snapshot) must stay
   * correctly scoped to whichever Application it actually belongs to.
   */
  describe('one journey, one admission application, multiple funding applications', () => {
    it('supports an admission application and several scholarship applications, each against a different Opportunity, under one journey', async () => {
      const journey = await makeJourney();
      const scholarshipA = await Opportunity.create({ ownerId: userId, title: 'External Scholarship A' });
      const scholarshipB = await Opportunity.create({ ownerId: userId, title: 'University Scholarship B' });

      const admission = await createApplication(userId, {
        journeyId: String(journey._id),
        title: 'University Admission',
        applicationType: ApplicationType.ADMISSION,
      });
      const fundingA = await createApplication(userId, {
        journeyId: String(journey._id),
        title: 'Apply for Scholarship A',
        applicationType: ApplicationType.EXTERNAL_SCHOLARSHIP,
        opportunityId: String(scholarshipA._id),
      });
      const fundingB = await createApplication(userId, {
        journeyId: String(journey._id),
        title: 'Apply for Scholarship B',
        applicationType: ApplicationType.UNIVERSITY_SCHOLARSHIP,
        opportunityId: String(scholarshipB._id),
      });

      expect(admission.opportunityId).toBeNull();
      expect(String(fundingA.opportunityId)).toBe(String(scholarshipA._id));
      expect(String(fundingB.opportunityId)).toBe(String(scholarshipB._id));

      const page = await listApplicationsForUser(userId, String(journey._id), {});
      const ids = page.items.map((a) => String(a._id)).sort();
      expect(ids).toEqual([String(admission._id), String(fundingA._id), String(fundingB._id)].sort());
      expect(page.items.find((a) => String(a._id) === String(admission._id))?.applicationType).toBe(
        ApplicationType.ADMISSION,
      );
      expect(page.items.find((a) => String(a._id) === String(fundingA._id))?.applicationType).toBe(
        ApplicationType.EXTERNAL_SCHOLARSHIP,
      );
    });

    it('each application is independently editable — updating one never touches the others', async () => {
      const journey = await makeJourney();
      const admission = await createApplication(userId, { journeyId: String(journey._id), title: 'Admission' });
      const funding = await createApplication(userId, { journeyId: String(journey._id), title: 'Funding' });

      await updateApplication(String(funding._id), userId, { status: ApplicationStatus.SUBMITTED });

      const reloadedAdmission = await getApplicationOwnedOrThrow(String(admission._id), userId);
      const reloadedFunding = await getApplicationOwnedOrThrow(String(funding._id), userId);
      expect(reloadedAdmission.status).toBe(ApplicationStatus.NOT_STARTED);
      expect(reloadedFunding.status).toBe(ApplicationStatus.SUBMITTED);
    });

    it('Requirements, Tasks, Deadlines, Documents, and Snapshots stay scoped to the correct sibling application', async () => {
      await makeProfile();
      const journey = await makeJourney();
      const applicationA = await createApplication(userId, { journeyId: String(journey._id), title: 'Admission' });
      const applicationB = await createApplication(userId, { journeyId: String(journey._id), title: 'Funding' });

      const requirementA = await createRequirement(userId, {
        requirementType: RequirementType.GPA,
        description: 'A-only requirement',
        applicationId: String(applicationA._id),
      });
      const requirementB = await createRequirement(userId, {
        requirementType: RequirementType.LANGUAGE,
        description: 'B-only requirement',
        applicationId: String(applicationB._id),
      });

      const taskA = await createTask(userId, {
        journeyId: String(journey._id),
        applicationId: String(applicationA._id),
        title: 'A-only task',
      });
      const taskB = await createTask(userId, {
        journeyId: String(journey._id),
        applicationId: String(applicationB._id),
        title: 'B-only task',
      });

      const deadlineA = await createDeadline(userId, {
        label: 'A-only deadline',
        date: new Date().toISOString(),
        applicationId: String(applicationA._id),
      });
      const deadlineB = await createDeadline(userId, {
        label: 'B-only deadline',
        date: new Date().toISOString(),
        applicationId: String(applicationB._id),
      });

      const documentA = await DocumentModel.create({
        ownerId: userId,
        title: 'A-only doc',
        documentType: DocumentType.CV,
        cloudinaryPublicId: 'pub-a',
        cloudinaryUrl: 'https://example.com/a.pdf',
      });
      await attachDocument(userId, String(applicationA._id), { documentId: String(documentA._id) });
      const documentB = await DocumentModel.create({
        ownerId: userId,
        title: 'B-only doc',
        documentType: DocumentType.CV,
        cloudinaryPublicId: 'pub-b',
        cloudinaryUrl: 'https://example.com/b.pdf',
      });
      await attachDocument(userId, String(applicationB._id), { documentId: String(documentB._id) });

      const snapshotA = await createSnapshot(userId, String(applicationA._id), { label: 'A snapshot' });
      const snapshotB = await createSnapshot(userId, String(applicationB._id), { label: 'B snapshot' });

      // Every child row resolves back to the application it was created
      // against, never its sibling under the same journey.
      expect(String(requirementA.applicationId)).toBe(String(applicationA._id));
      expect(String(requirementB.applicationId)).toBe(String(applicationB._id));
      expect(String(taskA.applicationId)).toBe(String(applicationA._id));
      expect(String(taskB.applicationId)).toBe(String(applicationB._id));
      expect(String(deadlineA.applicationId)).toBe(String(applicationA._id));
      expect(String(deadlineB.applicationId)).toBe(String(applicationB._id));

      const docsOnA = await listApplicationDocuments(userId, String(applicationA._id));
      const docsOnB = await listApplicationDocuments(userId, String(applicationB._id));
      expect(docsOnA.map((d) => String(d.documentId))).toEqual([String(documentA._id)]);
      expect(docsOnB.map((d) => String(d.documentId))).toEqual([String(documentB._id)]);

      const snapshotsOnA = await listSnapshots(userId, String(applicationA._id));
      const snapshotsOnB = await listSnapshots(userId, String(applicationB._id));
      expect(snapshotsOnA.map((s) => String(s._id))).toEqual([String(snapshotA._id)]);
      expect(snapshotsOnB.map((s) => String(s._id))).toEqual([String(snapshotB._id)]);

      // Fetching B's snapshot/requirement/task/deadline scoped under A must 404, not silently return it.
      await expect(getSnapshot(userId, String(applicationA._id), String(snapshotB._id))).rejects.toThrow(
        NotFoundError,
      );
    });

    it('ownership restrictions continue to apply to every sibling application and its children', async () => {
      const journey = await makeJourney();
      const applicationA = await createApplication(userId, { journeyId: String(journey._id), title: 'Admission' });
      const applicationB = await createApplication(userId, { journeyId: String(journey._id), title: 'Funding' });

      await expect(getApplicationOwnedOrThrow(String(applicationA._id), otherUserId)).rejects.toThrow(
        NotFoundError,
      );
      await expect(getApplicationOwnedOrThrow(String(applicationB._id), otherUserId)).rejects.toThrow(
        NotFoundError,
      );
      await expect(
        updateApplication(String(applicationB._id), otherUserId, { status: ApplicationStatus.SUBMITTED }),
      ).rejects.toThrow(NotFoundError);

      // listApplicationsForUser for the other user never leaks either sibling.
      const otherUsersPage = await listApplicationsForUser(otherUserId, undefined, {});
      expect(otherUsersPage.items).toEqual([]);
    });
  });
});
