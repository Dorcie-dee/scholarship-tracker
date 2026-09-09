import { NotFoundException } from '@nestjs/common';
import {
  ApplicationStatus,
  ApplicationType,
  SnapshotCreatedVia,
} from '../types';
import { ApplicationSnapshotsService } from './application-snapshots.service';

/**
 * Covers the manual-creation-only guarantee (createdVia is never
 * client-supplied), the exact data assembled into a snapshot, the
 * documentId+version-only historical reference (spec §21/9B final decision),
 * ownership enforcement on every path, cross-application access rejection,
 * and that the three independent reads in create() run concurrently rather
 * than sequentially.
 */
describe('ApplicationSnapshotsService', () => {
  const userId = 'user-1';
  const applicationId = 'application-1';

  const application = {
    id: applicationId,
    journeyId: 'journey-1',
    status: ApplicationStatus.IN_PROGRESS,
    applicationType: ApplicationType.ADMISSION,
    title: 'University of Twente — MSc Computer Science',
    startDate: '2026-01-01',
    submissionDate: null,
    portal: 'https://apply.utwente.nl',
    externalUrl: null,
    notes: 'Waiting on recommendation letter',
  };

  const profile = {
    userId,
    nationality: 'Ghanaian',
    dateOfBirth: '2000-01-01',
    summary: 'Aspiring CS researcher',
    education: [{ degree: 'BSc Computer Science' }],
    experience: [{ role: 'Research Assistant' }],
    skills: ['TypeScript', 'Postgres'],
    certifications: [],
    languages: ['English'],
    metadata: { internalNote: 'not application-relevant' },
  };

  let applicationSnapshots: any;
  let applicationDocuments: any;
  let requirements: any;
  let applicationsService: any;
  let profileService: any;
  let service: ApplicationSnapshotsService;

  beforeEach(() => {
    applicationSnapshots = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => ({ id: 'snapshot-1', ...row })),
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
    };
    applicationDocuments = { find: jest.fn(async () => []) };
    requirements = { find: jest.fn(async () => []) };
    applicationsService = {
      findOwnedOrThrow: jest.fn(async () => application),
    };
    profileService = { getByUserId: jest.fn(async () => profile) };

    service = new ApplicationSnapshotsService(
      applicationSnapshots,
      applicationDocuments,
      requirements,
      applicationsService,
      profileService,
    );
  });

  describe('create', () => {
    it('creates a snapshot with createdVia = MANUAL, ignoring anything a caller might try to supply', async () => {
      const snapshot = await service.create(userId, applicationId, {
        label: 'Before submitting',
      });

      expect(snapshot.createdVia).toBe(SnapshotCreatedVia.MANUAL);
      expect(applicationSnapshots.create).toHaveBeenCalledWith(
        expect.objectContaining({ createdVia: SnapshotCreatedVia.MANUAL }),
      );
    });

    it('rejects when the application is not owned by the caller, without reading anything else', async () => {
      applicationsService.findOwnedOrThrow.mockRejectedValueOnce(
        new Error('not your application'),
      );

      await expect(service.create(userId, applicationId, {})).rejects.toThrow(
        'not your application',
      );
      expect(applicationDocuments.find).not.toHaveBeenCalled();
      expect(requirements.find).not.toHaveBeenCalled();
      expect(profileService.getByUserId).not.toHaveBeenCalled();
      expect(applicationSnapshots.save).not.toHaveBeenCalled();
    });

    it('assembles application facts directly from the ownership-check result, not a second read', async () => {
      await service.create(userId, applicationId, {});

      expect(applicationsService.findOwnedOrThrow).toHaveBeenCalledTimes(1);
      const [created] = applicationSnapshots.create.mock.calls[0];
      expect(created.data.application).toEqual({
        status: application.status,
        applicationType: application.applicationType,
        title: application.title,
        startDate: application.startDate,
        submissionDate: application.submissionDate,
        portal: application.portal,
        externalUrl: application.externalUrl,
        notes: application.notes,
      });
    });

    it('captures only the relevant structured profile fields, excluding metadata', async () => {
      await service.create(userId, applicationId, {});

      const [created] = applicationSnapshots.create.mock.calls[0];
      expect(created.data.profile).toEqual({
        nationality: profile.nationality,
        dateOfBirth: profile.dateOfBirth,
        summary: profile.summary,
        education: profile.education,
        experience: profile.experience,
        skills: profile.skills,
        certifications: profile.certifications,
        languages: profile.languages,
      });
      expect(created.data.profile.metadata).toBeUndefined();
    });

    it('captures requirement id/type/description/status/notes as they stood at snapshot time', async () => {
      requirements.find.mockResolvedValueOnce([
        {
          id: 'requirement-1',
          requirementType: 'language',
          description: 'IELTS 6.5+',
          status: 'needs_verification',
          notes: 'Awaiting official score report',
          copiedFromRequirementId: null,
        },
      ]);

      await service.create(userId, applicationId, {});

      const [created] = applicationSnapshots.create.mock.calls[0];
      expect(created.data.requirements).toEqual([
        {
          requirementId: 'requirement-1',
          requirementType: 'language',
          description: 'IELTS 6.5+',
          status: 'needs_verification',
          notes: 'Awaiting official score report',
          copiedFromRequirementId: null,
        },
      ]);
    });

    /** Track 1 Group D (D-P6) — Group C requirement provenance in snapshots. */
    describe('requirement provenance (D-P6)', () => {
      it('captures copiedFromRequirementId as null for a manually-created Application Requirement', async () => {
        requirements.find.mockResolvedValueOnce([
          {
            id: 'requirement-manual',
            requirementType: 'document',
            description: 'CV',
            status: 'unknown',
            notes: null,
            copiedFromRequirementId: null,
          },
        ]);

        await service.create(userId, applicationId, {});

        const [created] = applicationSnapshots.create.mock.calls[0];
        expect(created.data.requirements[0].copiedFromRequirementId).toBeNull();
      });

      it('captures copiedFromRequirementId for a Group C copied requirement', async () => {
        requirements.find.mockResolvedValueOnce([
          {
            id: 'requirement-copy',
            requirementType: 'document',
            description: 'CV',
            status: 'unknown',
            notes: null,
            copiedFromRequirementId: 'opportunity-requirement-source',
          },
        ]);

        await service.create(userId, applicationId, {});

        const [created] = applicationSnapshots.create.mock.calls[0];
        expect(created.data.requirements[0].copiedFromRequirementId).toBe(
          'opportunity-requirement-source',
        );
      });

      it('never re-reads the source Opportunity Requirement — copiedFromRequirementId is copied as a plain value', async () => {
        const sourceRequirement = {
          id: 'requirement-copy',
          requirementType: 'document',
          description: 'CV',
          status: 'unknown',
          notes: null,
          copiedFromRequirementId: 'opportunity-requirement-source',
        };
        requirements.find.mockResolvedValueOnce([sourceRequirement]);

        await service.create(userId, applicationId, {});

        // The service only ever calls requirements.find() once (the
        // Application-scoped read) — nothing looks up
        // `copiedFromRequirementId` against any other repository or service.
        expect(requirements.find).toHaveBeenCalledTimes(1);
      });
    });

    it('captures the exact documentId + version pinned via ApplicationDocument, not whichever version is currently "current"', async () => {
      applicationDocuments.find.mockResolvedValueOnce([
        {
          documentId: 'document-cv',
          label: 'Primary CV',
          document: { version: 2, isCurrent: false }, // superseded by v3 elsewhere
        },
      ]);

      await service.create(userId, applicationId, {});

      const [created] = applicationSnapshots.create.mock.calls[0];
      expect(created.data.documents).toEqual([
        { documentId: 'document-cv', version: 2 },
      ]);
      // No title/documentType/label/cloudinaryUrl duplicated — only the
      // minimum historical identity, per the approved design.
      expect(created.data.documents[0]).not.toHaveProperty('label');
      expect(created.data.documents[0]).not.toHaveProperty('documentType');
    });

    it('leaves writtenResponses empty — no storage model exists for it yet', async () => {
      await service.create(userId, applicationId, {});

      const [created] = applicationSnapshots.create.mock.calls[0];
      expect(created.data.writtenResponses).toEqual([]);
    });

    it('runs the three independent reads concurrently, not sequentially', async () => {
      let resolveDocuments!: (value: any[]) => void;
      applicationDocuments.find.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveDocuments = resolve;
        }),
      );

      const pending = service.create(userId, applicationId, {});

      // If these ran sequentially after applicationDocuments.find(), neither
      // call below would have happened yet — because we haven't resolved
      // applicationDocuments.find()'s promise. Promise.all invokes all three
      // synchronously up front, so both should already have been called.
      await Promise.resolve();
      await Promise.resolve();
      expect(requirements.find).toHaveBeenCalled();
      expect(profileService.getByUserId).toHaveBeenCalled();

      resolveDocuments([]);
      await pending;
    });
  });

  describe('findAllForApplication', () => {
    it('rejects when the application is not owned by the caller', async () => {
      applicationsService.findOwnedOrThrow.mockRejectedValueOnce(
        new Error('not your application'),
      );

      await expect(
        service.findAllForApplication(userId, applicationId),
      ).rejects.toThrow('not your application');
      expect(applicationSnapshots.find).not.toHaveBeenCalled();
    });

    it('returns the application-scoped snapshots in creation order', async () => {
      const rows = [{ id: 'snapshot-1' }, { id: 'snapshot-2' }];
      applicationSnapshots.find.mockResolvedValueOnce(rows);

      const result = await service.findAllForApplication(userId, applicationId);

      expect(result).toBe(rows);
      expect(applicationSnapshots.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { applicationId },
          order: { createdAt: 'ASC' },
        }),
      );
    });
  });

  describe('findOneOrThrow', () => {
    it('rejects when the application is not owned by the caller', async () => {
      applicationsService.findOwnedOrThrow.mockRejectedValueOnce(
        new Error('not your application'),
      );

      await expect(
        service.findOneOrThrow(userId, applicationId, 'snapshot-1'),
      ).rejects.toThrow('not your application');
    });

    it('404s when the snapshot id belongs to a different application, even one the caller owns', async () => {
      // The mock's `where` doesn't filter — this simulates the query
      // correctly scoping by BOTH id and applicationId by asserting the call
      // shape, then separately confirming a null result 404s.
      applicationSnapshots.findOne.mockResolvedValueOnce(null);

      await expect(
        service.findOneOrThrow(userId, applicationId, 'someone-elses-snapshot'),
      ).rejects.toThrow(NotFoundException);
      expect(applicationSnapshots.findOne).toHaveBeenCalledWith({
        where: { id: 'someone-elses-snapshot', applicationId },
      });
    });

    it('returns the snapshot when it exists and belongs to this application', async () => {
      const snapshot = { id: 'snapshot-1', applicationId };
      applicationSnapshots.findOne.mockResolvedValueOnce(snapshot);

      const result = await service.findOneOrThrow(
        userId,
        applicationId,
        'snapshot-1',
      );

      expect(result).toBe(snapshot);
    });
  });

  describe('immutability — no mutation path exists', () => {
    it('has no update or remove method', () => {
      expect((service as any).update).toBeUndefined();
      expect((service as any).remove).toBeUndefined();
    });
  });
});
