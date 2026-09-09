import { NotFoundException } from '@nestjs/common';
import { OpportunitySourcesService } from './opportunity-sources.service';

/**
 * Track 1 Group B — closes this service's previous zero-test-coverage gap,
 * including F3 (the update() relationship-validation fix).
 */
describe('OpportunitySourcesService', () => {
  let sources: any;
  let opportunitiesService: any;
  let service: OpportunitySourcesService;

  beforeEach(() => {
    sources = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => ({ id: 'source-1', ...row })),
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      delete: jest.fn(async () => ({ affected: 1 })),
    };
    opportunitiesService = {
      findOneOrThrow: jest.fn(async (id: string) => ({ id })),
    };
    service = new OpportunitySourcesService(sources, opportunitiesService);
  });

  describe('create', () => {
    it('validates the opportunity exists before creating the source', async () => {
      await service.create({
        opportunityId: 'opportunity-1',
        sourceUrl: 'https://example.invalid/scholarship',
      });

      expect(opportunitiesService.findOneOrThrow).toHaveBeenCalledWith(
        'opportunity-1',
      );
      expect(sources.save).toHaveBeenCalled();
    });

    it('rejects when the opportunity does not exist, without creating the source', async () => {
      opportunitiesService.findOneOrThrow.mockRejectedValueOnce(
        new NotFoundException('Opportunity not found'),
      );

      await expect(
        service.create({ opportunityId: 'missing' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(sources.save).not.toHaveBeenCalled();
    });

    it('defaults capturedAt to now when not supplied', async () => {
      const before = Date.now();
      const result = await service.create({
        opportunityId: 'opportunity-1',
      });
      expect(result.capturedAt.getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  /**
   * F3: previously update() did NOT validate a changed opportunityId at
   * all — an invalid id would 500 instead of 404, and a valid-but-different
   * id would silently re-parent the source to an unrelated opportunity.
   */
  describe('update — F3 fix', () => {
    it('validates a NEWLY supplied opportunityId before applying the update', async () => {
      sources.findOne.mockResolvedValueOnce({
        id: 'source-1',
        opportunityId: 'opportunity-1',
      });

      await service.update('source-1', {
        opportunityId: 'opportunity-2',
      });

      expect(opportunitiesService.findOneOrThrow).toHaveBeenCalledWith(
        'opportunity-2',
      );
    });

    it('rejects re-parenting to a nonexistent opportunity', async () => {
      sources.findOne.mockResolvedValueOnce({
        id: 'source-1',
        opportunityId: 'opportunity-1',
      });
      opportunitiesService.findOneOrThrow.mockRejectedValueOnce(
        new NotFoundException('Opportunity not found'),
      );

      await expect(
        service.update('source-1', { opportunityId: 'missing' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(sources.save).not.toHaveBeenCalled();
    });

    it('does not re-validate opportunityId when the update does not touch it', async () => {
      sources.findOne.mockResolvedValueOnce({
        id: 'source-1',
        opportunityId: 'opportunity-1',
      });

      await service.update('source-1', { sourceName: 'Newsletter' });

      expect(opportunitiesService.findOneOrThrow).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes an existing source', async () => {
      sources.findOne.mockResolvedValueOnce({ id: 'source-1' });
      await service.remove('source-1');
      expect(sources.delete).toHaveBeenCalledWith('source-1');
    });

    it('throws NotFoundException instead of deleting nothing when the source is missing', async () => {
      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(sources.delete).not.toHaveBeenCalled();
    });
  });
});
