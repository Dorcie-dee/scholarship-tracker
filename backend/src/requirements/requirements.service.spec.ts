import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RequirementsService } from './requirements.service';

/**
 * Track 1 Group B — closes this service's previous zero-test-coverage gap.
 * This is the most security-relevant untested logic found in the Group B
 * audit: the "at least one parent" invariant, and the ownership-chaining
 * that determines whether a Requirement is shared catalog data or a
 * specific user's owned data.
 */
describe('RequirementsService', () => {
  const userId = 'user-1';

  let requirements: any;
  let opportunitiesService: any;
  let applicationsService: any;
  let service: RequirementsService;

  beforeEach(() => {
    requirements = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => ({ id: 'requirement-1', ...row })),
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      delete: jest.fn(async () => ({ affected: 1 })),
    };
    opportunitiesService = {
      findOneOrThrow: jest.fn(async (id: string) => ({ id })),
    };
    applicationsService = {
      assertApplicationOwnedByUser: jest.fn(async () => undefined),
    };
    service = new RequirementsService(
      requirements,
      opportunitiesService,
      applicationsService,
    );
  });

  describe('create — the "at least one parent" invariant', () => {
    it('rejects a requirement with neither opportunityId nor applicationId', async () => {
      await expect(
        service.create(userId, { description: 'IELTS 6.5+' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(requirements.save).not.toHaveBeenCalled();
    });

    it('accepts an opportunity-only requirement (shared catalog, no ownership check)', async () => {
      await service.create(userId, {
        description: 'IELTS 6.5+',
        opportunityId: 'opportunity-1',
      } as any);

      expect(opportunitiesService.findOneOrThrow).toHaveBeenCalledWith(
        'opportunity-1',
      );
      expect(
        applicationsService.assertApplicationOwnedByUser,
      ).not.toHaveBeenCalled();
      expect(requirements.save).toHaveBeenCalled();
    });

    it('accepts an application-only requirement, checking ownership', async () => {
      await service.create(userId, {
        description: 'IELTS 6.5+',
        applicationId: 'application-1',
      } as any);

      expect(
        applicationsService.assertApplicationOwnedByUser,
      ).toHaveBeenCalledWith('application-1', userId);
      expect(opportunitiesService.findOneOrThrow).not.toHaveBeenCalled();
    });

    it("rejects when the application exists but is not owned by the caller — cannot attach a requirement to someone else's application", async () => {
      applicationsService.assertApplicationOwnedByUser.mockRejectedValueOnce(
        new Error('not your application'),
      );

      await expect(
        service.create(userId, {
          description: 'IELTS 6.5+',
          applicationId: 'someone-elses-application',
        } as any),
      ).rejects.toThrow('not your application');
      expect(requirements.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('rejects when neither filter is provided', async () => {
      await expect(service.findAll(userId, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('checks application ownership before listing application-scoped requirements', async () => {
      await service.findAll(userId, { applicationId: 'application-1' });
      expect(
        applicationsService.assertApplicationOwnedByUser,
      ).toHaveBeenCalledWith('application-1', userId);
    });

    it('does not check ownership for an opportunity-only filter', async () => {
      await service.findAll(userId, { opportunityId: 'opportunity-1' });
      expect(
        applicationsService.assertApplicationOwnedByUser,
      ).not.toHaveBeenCalled();
    });
  });

  describe('findOneAccessible — ownership chaining', () => {
    it('allows access to an opportunity-only requirement without any ownership check', async () => {
      requirements.findOne.mockResolvedValueOnce({
        id: 'requirement-1',
        opportunityId: 'opportunity-1',
        applicationId: null,
      });

      const result = await service.findOneAccessible('requirement-1', userId);

      expect(result.id).toBe('requirement-1');
      expect(
        applicationsService.assertApplicationOwnedByUser,
      ).not.toHaveBeenCalled();
    });

    it('rejects access to an application-linked requirement not owned by the caller', async () => {
      requirements.findOne.mockResolvedValueOnce({
        id: 'requirement-1',
        opportunityId: null,
        applicationId: 'someone-elses-application',
      });
      applicationsService.assertApplicationOwnedByUser.mockRejectedValueOnce(
        new Error('not your application'),
      );

      await expect(
        service.findOneAccessible('requirement-1', userId),
      ).rejects.toThrow('not your application');
    });

    it('throws NotFoundException for a nonexistent requirement', async () => {
      await expect(
        service.findOneAccessible('missing', userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('re-validates a newly supplied opportunityId', async () => {
      requirements.findOne.mockResolvedValueOnce({
        id: 'requirement-1',
        opportunityId: 'opportunity-1',
        applicationId: null,
      });
      opportunitiesService.findOneOrThrow.mockClear();

      await service.update('requirement-1', userId, {
        opportunityId: 'opportunity-2',
      });

      expect(opportunitiesService.findOneOrThrow).toHaveBeenCalledWith(
        'opportunity-2',
      );
    });

    it("re-validates a newly supplied applicationId against the CALLER's ownership — cannot re-link to someone else's application", async () => {
      requirements.findOne.mockResolvedValueOnce({
        id: 'requirement-1',
        opportunityId: 'opportunity-1',
        applicationId: null,
      });
      applicationsService.assertApplicationOwnedByUser.mockRejectedValueOnce(
        new Error('not your application'),
      );

      await expect(
        service.update('requirement-1', userId, {
          applicationId: 'someone-elses-application',
        } as any),
      ).rejects.toThrow('not your application');
      expect(requirements.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes an accessible requirement', async () => {
      requirements.findOne.mockResolvedValueOnce({
        id: 'requirement-1',
        opportunityId: 'opportunity-1',
        applicationId: null,
      });

      await service.remove('requirement-1', userId);
      expect(requirements.delete).toHaveBeenCalledWith('requirement-1');
    });

    it('rejects deleting an application-linked requirement not owned by the caller', async () => {
      requirements.findOne.mockResolvedValueOnce({
        id: 'requirement-1',
        opportunityId: null,
        applicationId: 'someone-elses-application',
      });
      applicationsService.assertApplicationOwnedByUser.mockRejectedValueOnce(
        new Error('not your application'),
      );

      await expect(service.remove('requirement-1', userId)).rejects.toThrow(
        'not your application',
      );
      expect(requirements.delete).not.toHaveBeenCalled();
    });
  });
});
