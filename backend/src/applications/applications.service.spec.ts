import { BadRequestException } from '@nestjs/common';
import { RequirementStatus, RequirementType } from '../types';
import { ApplicationsService } from './applications.service';

/**
 * Covers the Promise.all parallelization in create() (journey ownership +
 * opportunity existence), Track 1 Group C's I5/C1.3 (Application.journeyId
 * immutability), and I6/C3 (one-time Opportunity → Application Requirement
 * copy, atomic with the Application's own creation).
 */
describe('ApplicationsService', () => {
  const userId = 'user-1';
  const journey = { id: 'journey-1', userId };

  let applications: any;
  let requirements: any;
  let journeysService: any;
  let opportunitiesService: any;
  let service: ApplicationsService;
  let fakeManager: any;

  beforeEach(() => {
    let nextId = 1;
    const applicationRows = new Map<string, any>();
    const requirementRows: any[] = [];

    applications = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => {
        const withId = {
          id: row.id ?? `application-${nextId++}`,
          journey,
          ...row,
        };
        applicationRows.set(withId.id, withId);
        return withId;
      }),
      findOne: jest.fn(async ({ where: { id } }: any) => {
        const row = applicationRows.get(id);
        return row ? { ...row, journey } : { id, journey };
      }),
      manager: null as any, // set below, after fakeManager exists
    };

    requirements = {
      find: jest.fn(async ({ where }: any) =>
        requirementRows.filter((r) => r.opportunityId === where.opportunityId),
      ),
    };

    // fakeManager mirrors the subset of TypeORM's EntityManager API
    // ApplicationsService.create() actually calls — same manager.transaction
    // mock pattern already established for Document version writes and
    // AuthService.refresh().
    fakeManager = {
      create: jest.fn((Entity: any, partial: any) => ({
        __entity: Entity,
        ...partial,
      })),
      save: jest.fn(async (entityOrArray: any, maybeArray?: any) => {
        // Repository-style manager.save(Entity, entities[]) vs
        // manager.save(entityInstance) — ApplicationsService uses both
        // shapes (application instance directly, Requirement array via the
        // two-arg form), so this mock supports both.
        const isArrayForm = Array.isArray(maybeArray);
        const rows = isArrayForm
          ? maybeArray
          : Array.isArray(entityOrArray)
            ? entityOrArray
            : [entityOrArray];
        const saved = rows.map((row: any) => {
          const withId = {
            id: row.id ?? `${row.__entity?.name ?? 'row'}-${nextId++}`,
            ...row,
          };
          if (
            withId.__entity?.name === 'Requirement' ||
            'requirementType' in row
          ) {
            requirementRows.push(withId);
          }
          return withId;
        });
        return isArrayForm || Array.isArray(entityOrArray) ? saved : saved[0];
      }),
    };
    applications.manager = {
      transaction: jest.fn(async (cb: any) => cb(fakeManager)),
    };

    journeysService = { findOwnedOrThrow: jest.fn(async () => journey) };
    opportunitiesService = {
      findOneOrThrow: jest.fn(async (id: string) => ({ id })),
    };

    service = new ApplicationsService(
      applications,
      requirements,
      journeysService,
      opportunitiesService,
    );

    // Expose a way for tests to seed "existing" opportunity requirements.
    (service as any).__seedOpportunityRequirements = (
      opportunityId: string,
      reqs: any[],
    ) => {
      requirementRows.push(
        ...reqs.map((r) => ({ opportunityId, applicationId: null, ...r })),
      );
    };
  });

  describe('create — parallelized validation checks', () => {
    it('validates both journey ownership and opportunity existence when both apply', async () => {
      await service.create(userId, {
        journeyId: journey.id,
        title: 'Twente Excellence Scholarship',
        opportunityId: 'opportunity-1',
      });

      expect(journeysService.findOwnedOrThrow).toHaveBeenCalledWith(
        journey.id,
        userId,
      );
      expect(opportunitiesService.findOneOrThrow).toHaveBeenCalledWith(
        'opportunity-1',
      );
    });

    it('still rejects when the journey ownership check fails', async () => {
      journeysService.findOwnedOrThrow.mockRejectedValueOnce(
        new Error('journey not owned'),
      );

      await expect(
        service.create(userId, {
          journeyId: 'someone-elses-journey',
          title: 'Twente Excellence Scholarship',
          opportunityId: 'opportunity-1',
        } as any),
      ).rejects.toThrow('journey not owned');
    });

    it('still rejects when the opportunity does not exist', async () => {
      opportunitiesService.findOneOrThrow.mockRejectedValueOnce(
        new Error('opportunity not found'),
      );

      await expect(
        service.create(userId, {
          journeyId: journey.id,
          title: 'Twente Excellence Scholarship',
          opportunityId: 'missing-opportunity',
        } as any),
      ).rejects.toThrow('opportunity not found');
    });
  });

  /** I6 / C3 — one-time Opportunity → Application requirement copy. */
  describe('create — Opportunity requirement copy (I6)', () => {
    it('copies each Opportunity-scoped requirement into a new, independent Application-scoped requirement', async () => {
      (service as any).__seedOpportunityRequirements('opportunity-1', [
        {
          id: 'req-cv',
          requirementType: RequirementType.DOCUMENT,
          description: 'CV',
          status: RequirementStatus.CONFIRMED, // deliberately non-default, to prove it's NOT copied
          notes: 'Original note',
        },
        {
          id: 'req-transcript',
          requirementType: RequirementType.ACADEMIC,
          description: 'Transcript',
          status: RequirementStatus.NEEDS_VERIFICATION,
          notes: null,
        },
      ]);

      const application = await service.create(userId, {
        journeyId: journey.id,
        title: 'Twente Excellence Scholarship',
        opportunityId: 'opportunity-1',
      });

      const copies = fakeManager.save.mock.calls
        .flatMap((call: any[]) => (Array.isArray(call[1]) ? call[1] : []))
        .filter((r: any) => 'requirementType' in r);

      expect(copies).toHaveLength(2);
      expect(copies.map((c: any) => c.description).sort()).toEqual([
        'CV',
        'Transcript',
      ]);
      for (const copy of copies) {
        expect(copy.applicationId).toBe(application.id);
        expect(copy.opportunityId).toBeNull();
        // Fresh default status, NOT copied from the source row.
        expect(copy.status).toBe(RequirementStatus.UNKNOWN);
      }
      expect(
        copies.find((c: any) => c.description === 'CV').copiedFromRequirementId,
      ).toBe('req-cv');
      expect(
        copies.find((c: any) => c.description === 'Transcript')
          .copiedFromRequirementId,
      ).toBe('req-transcript');
    });

    it('copies notes but not status/ids/timestamps from the source requirement', async () => {
      (service as any).__seedOpportunityRequirements('opportunity-1', [
        {
          id: 'req-cv',
          requirementType: RequirementType.DOCUMENT,
          description: 'CV',
          status: RequirementStatus.CONFIRMED,
          notes: 'Two pages max',
        },
      ]);

      await service.create(userId, {
        journeyId: journey.id,
        title: 'Twente Excellence Scholarship',
        opportunityId: 'opportunity-1',
      });

      const [copy] = fakeManager.save.mock.calls
        .flatMap((call: any[]) => (Array.isArray(call[1]) ? call[1] : []))
        .filter((r: any) => 'requirementType' in r);

      expect(copy.notes).toBe('Two pages max');
      expect(copy.requirementType).toBe(RequirementType.DOCUMENT);
      expect(copy.description).toBe('CV');
    });

    it('copies nothing when the Application has no Opportunity', async () => {
      await service.create(userId, {
        journeyId: journey.id,
        title: 'Plain admission',
      });

      expect(requirements.find).not.toHaveBeenCalled();
      const requirementSaveCalls = fakeManager.save.mock.calls.filter(
        (call: any[]) => Array.isArray(call[1]),
      );
      expect(requirementSaveCalls).toHaveLength(0);
    });

    it('creates successfully with zero copied requirements when the Opportunity has none', async () => {
      // No __seedOpportunityRequirements call — opportunity-1 has none.
      const application = await service.create(userId, {
        journeyId: journey.id,
        title: 'Twente Excellence Scholarship',
        opportunityId: 'opportunity-1',
      });

      expect(application).toBeDefined();
      const requirementSaveCalls = fakeManager.save.mock.calls.filter(
        (call: any[]) => Array.isArray(call[1]),
      );
      expect(requirementSaveCalls).toHaveLength(0);
    });

    it("only copies requirements scoped to the SPECIFIED opportunity, never another opportunity's or an application-scoped requirement", async () => {
      (service as any).__seedOpportunityRequirements('opportunity-1', [
        {
          id: 'req-1',
          requirementType: RequirementType.DOCUMENT,
          description: 'CV',
          status: RequirementStatus.UNKNOWN,
          notes: null,
        },
      ]);
      (service as any).__seedOpportunityRequirements('opportunity-OTHER', [
        {
          id: 'req-unrelated',
          requirementType: RequirementType.DOCUMENT,
          description: 'Unrelated',
          status: RequirementStatus.UNKNOWN,
          notes: null,
        },
      ]);

      await service.create(userId, {
        journeyId: journey.id,
        title: 'Twente Excellence Scholarship',
        opportunityId: 'opportunity-1',
      });

      expect(requirements.find).toHaveBeenCalledWith({
        where: { opportunityId: 'opportunity-1' },
      });
    });

    it('does the Application INSERT and the Requirement copy INSERT inside the SAME transaction', async () => {
      (service as any).__seedOpportunityRequirements('opportunity-1', [
        {
          id: 'req-1',
          requirementType: RequirementType.DOCUMENT,
          description: 'CV',
          status: RequirementStatus.UNKNOWN,
          notes: null,
        },
      ]);

      await service.create(userId, {
        journeyId: journey.id,
        title: 'Twente Excellence Scholarship',
        opportunityId: 'opportunity-1',
      });

      expect(applications.manager.transaction).toHaveBeenCalledTimes(1);
    });
  });

  /** I5 / C1.3 — Application.journeyId is immutable after creation. */
  describe('update — journeyId immutability', () => {
    it('accepts an update that resends the SAME (unchanged) journeyId as a no-op', async () => {
      applications.findOne.mockResolvedValueOnce({
        id: 'application-1',
        journeyId: journey.id,
        journey,
        title: 'Old title',
      });

      const result = await service.update('application-1', userId, {
        journeyId: journey.id,
        title: 'New title',
      });

      expect(result.title).toBe('New title');
    });

    it('rejects an attempted journeyId change with a clean 4xx, not a silent ignore', async () => {
      applications.findOne.mockResolvedValueOnce({
        id: 'application-1',
        journeyId: 'journey-1',
        journey,
      });

      await expect(
        service.update('application-1', userId, {
          journeyId: 'journey-2',
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(applications.save).not.toHaveBeenCalled();
    });

    it('leaves the application attached to its original journey when a change is rejected', async () => {
      const original = {
        id: 'application-1',
        journeyId: 'journey-1',
        journey,
      };
      applications.findOne.mockResolvedValueOnce(original);

      await expect(
        service.update('application-1', userId, {
          journeyId: 'journey-2',
        } as any),
      ).rejects.toThrow(BadRequestException);

      // The in-memory object itself was never mutated before the throw.
      expect(original.journeyId).toBe('journey-1');
    });

    it('an unrelated field update still succeeds normally', async () => {
      applications.findOne.mockResolvedValueOnce({
        id: 'application-1',
        journeyId: journey.id,
        journey,
        title: 'Old title',
      });

      const result = await service.update('application-1', userId, {
        title: 'New title',
      });

      expect(result.title).toBe('New title');
    });
  });

  /**
   * A Journey legitimately fans out into several Applications (e.g. an
   * admission Application and one or more separate scholarship Applications
   * for the same programme) — nothing in create() restricts a Journey to a
   * single Application, and an Application's linked Opportunity need not
   * match the Journey's own University/Programme (that consistency isn't
   * required by this schema — see docs/decisions.md).
   */
  describe('create — a Journey can have multiple Applications', () => {
    it('allows creating a second, independent Application under the same Journey', async () => {
      const first = await service.create(userId, {
        journeyId: journey.id,
        title: 'Admission',
      });
      const second = await service.create(userId, {
        journeyId: journey.id,
        title: 'Scholarship',
        opportunityId: 'opportunity-scholarship',
      });

      expect(first.id).not.toBe(second.id);
      expect(first.journeyId ?? journey.id).toBe(
        second.journeyId ?? journey.id,
      );
    });

    it('does not require the Opportunity to have any particular relationship to the Journey', async () => {
      // opportunitiesService.findOneOrThrow only checks the Opportunity
      // exists — it is never cross-checked against the Journey's own
      // University/Programme, and create() must not silently add that check.
      const application = await service.create(userId, {
        journeyId: journey.id,
        title: 'Unrelated scholarship',
        opportunityId: 'opportunity-from-a-different-university',
      });

      expect(application).toBeDefined();
      expect(opportunitiesService.findOneOrThrow).toHaveBeenCalledWith(
        'opportunity-from-a-different-university',
      );
    });
  });
});
