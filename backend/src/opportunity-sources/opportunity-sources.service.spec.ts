import { NotFoundException } from '@nestjs/common';
import { OpportunitySourcesService } from './opportunity-sources.service';

/**
 * Track 1 Group B — closes this service's previous zero-test-coverage gap,
 * including F3 (the update() relationship-validation fix).
 */
describe('OpportunitySourcesService', () => {
  let sources: any;
  let opportunitiesService: any;
  let configService: any;
  let service: OpportunitySourcesService;
  let rows: any[];

  const makeQueryBuilder = () => {
    let opportunityId: string | undefined;
    let cursorSortValue: string | undefined;
    let cursorId: string | undefined;
    let limit = Infinity;
    const qb: any = {
      andWhere: jest.fn((_sql: string, params: any) => {
        if ('opportunityId' in params) opportunityId = params.opportunityId;
        if ('cursorSortValue' in params) {
          cursorSortValue = params.cursorSortValue;
          cursorId = params.cursorId;
        }
        return qb;
      }),
      orderBy: jest.fn(() => qb),
      addOrderBy: jest.fn(() => qb),
      take: jest.fn((n: number) => {
        limit = n;
        return qb;
      }),
      getMany: jest.fn(async () => {
        let result = [...rows];
        if (opportunityId) {
          result = result.filter((r) => r.opportunityId === opportunityId);
        }
        result.sort(
          (a, b) =>
            b.capturedAt.getTime() - a.capturedAt.getTime() ||
            b.id.localeCompare(a.id),
        );
        if (cursorSortValue !== undefined) {
          const cursorTime = new Date(cursorSortValue).getTime();
          result = result.filter(
            (r) =>
              r.capturedAt.getTime() < cursorTime ||
              (r.capturedAt.getTime() === cursorTime && r.id < cursorId!),
          );
        }
        return result.slice(0, limit);
      }),
    };
    return qb;
  };

  beforeEach(() => {
    rows = [];
    sources = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => ({ id: 'source-1', ...row })),
      findOne: jest.fn(async () => null),
      delete: jest.fn(async () => ({ affected: 1 })),
      createQueryBuilder: jest.fn(() => makeQueryBuilder()),
    };
    opportunitiesService = {
      findOneOrThrow: jest.fn(async (id: string) => ({ id })),
    };
    configService = {
      get: jest.fn(() => ({ defaultPageSize: 25, maxPageSize: 100 })),
    };
    const urlFetchService = {
      fetchPreview: jest.fn(),
    };
    service = new OpportunitySourcesService(
      sources,
      opportunitiesService,
      configService,
      urlFetchService as any,
    );
  });

  describe('findAll — pagination (Batch 4)', () => {
    beforeEach(() => {
      rows = [
        {
          id: 'src-1',
          opportunityId: 'opportunity-1',
          capturedAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: 'src-2',
          opportunityId: 'opportunity-2',
          capturedAt: new Date('2026-02-01T00:00:00Z'),
        },
      ];
    });

    it('filters by opportunityId when given', async () => {
      const result = await service.findAll({ opportunityId: 'opportunity-1' });
      expect(result.items.map((r: any) => r.id)).toEqual(['src-1']);
    });

    it('orders newest-first when unfiltered', async () => {
      const result = await service.findAll({});
      expect(result.items.map((r: any) => r.id)).toEqual(['src-2', 'src-1']);
    });
  });

  describe('create', () => {
    let urlFetchService: any;

    beforeEach(() => {
      urlFetchService = {
        fetchPreview: jest.fn(async () => ({
          url: 'https://example.invalid/scholarship',
          finalUrl: 'https://example.invalid/scholarship',
          title: 'Fetched Title',
          extractedContent: 'Fetched body text',
          contentType: 'text/html',
        })),
      };
      service = new OpportunitySourcesService(
        sources,
        opportunitiesService,
        configService,
        urlFetchService,
      );
    });

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

    it('autoFetch fills empty fields and sets contentOrigin=fetched', async () => {
      await service.create({
        opportunityId: 'opportunity-1',
        sourceUrl: 'https://example.invalid/scholarship',
        autoFetch: true,
      });

      expect(urlFetchService.fetchPreview).toHaveBeenCalled();
      expect(sources.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceName: 'Fetched Title',
          extractedContent: 'Fetched body text',
          contentOrigin: 'fetched',
          sourceUrl: 'https://example.invalid/scholarship',
        }),
      );
    });

    it('autoFetch never overwrites user-supplied content', async () => {
      await service.create({
        opportunityId: 'opportunity-1',
        sourceUrl: 'https://example.invalid/scholarship',
        sourceName: 'My title',
        extractedContent: 'My excerpt',
        autoFetch: true,
      });

      expect(sources.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceName: 'My title',
          extractedContent: 'My excerpt',
          contentOrigin: 'manual',
        }),
      );
    });

    it('autoFetch does not create an Opportunity', async () => {
      await service.create({
        opportunityId: 'opportunity-1',
        sourceUrl: 'https://example.invalid/scholarship',
        autoFetch: true,
      });
      expect(opportunitiesService.findOneOrThrow).toHaveBeenCalledTimes(1);
      expect(Object.keys(opportunitiesService)).not.toContain('create');
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
