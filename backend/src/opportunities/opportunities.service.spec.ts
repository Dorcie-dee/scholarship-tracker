import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';

/**
 * Covers the existence-check vs. full-detail-load split (see
 * opportunities.service.ts's doc comments), plus Track 1 Group B's F1/F2/F7
 * fixes: relationship validation on create/update (F1), the
 * University↔Programme cross-consistency check (F2), and findAll() no
 * longer eager-loading relations for every row (F7).
 */
describe('OpportunitiesService', () => {
  let opportunities: any;
  let universitiesService: any;
  let programmesService: any;
  let configService: any;
  let service: OpportunitiesService;
  let rows: any[];

  const makeQueryBuilder = () => {
    const filters: Record<string, unknown> = {};
    let limit = Infinity;
    const qb: any = {
      andWhere: jest.fn((_sql: string, params: any) => {
        Object.assign(filters, params);
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
        if (filters.universityId) {
          result = result.filter(
            (r) => r.universityId === filters.universityId,
          );
        }
        if (filters.studyLevel) {
          result = result.filter((r) => r.studyLevel === filters.studyLevel);
        }
        result.sort(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() ||
            b.id.localeCompare(a.id),
        );
        if (filters.cursorSortValue !== undefined) {
          const cursorTime = new Date(
            filters.cursorSortValue as string,
          ).getTime();
          result = result.filter(
            (r) =>
              r.createdAt.getTime() < cursorTime ||
              (r.createdAt.getTime() === cursorTime &&
                r.id < (filters.cursorId as string)),
          );
        }
        return result.slice(0, limit);
      }),
    };
    return qb;
  };

  beforeEach(() => {
    rows = [];
    opportunities = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => ({ id: 'opportunity-1', ...row })),
      findOne: jest.fn(async () => ({ id: 'opportunity-1', title: 'Sample' })),
      createQueryBuilder: jest.fn(() => makeQueryBuilder()),
    };
    universitiesService = {
      findOneOrThrow: jest.fn(async (id: string) => ({ id })),
    };
    programmesService = {
      findOneOrThrow: jest.fn(async (id: string) => ({
        id,
        universityId: 'university-1',
      })),
    };
    configService = {
      get: jest.fn(() => ({ defaultPageSize: 25, maxPageSize: 100 })),
    };
    service = new OpportunitiesService(
      opportunities,
      universitiesService,
      programmesService,
      configService,
    );
  });

  describe('existence check vs. full detail load', () => {
    it('findOneOrThrow does not request relations', async () => {
      await service.findOneOrThrow('opportunity-1');

      expect(opportunities.findOne).toHaveBeenCalledWith({
        where: { id: 'opportunity-1' },
      });
    });

    it('findOneWithDetailsOrThrow requests sources/requirements/deadlines', async () => {
      await service.findOneWithDetailsOrThrow('opportunity-1');

      expect(opportunities.findOne).toHaveBeenCalledWith({
        where: { id: 'opportunity-1' },
        relations: { sources: true, requirements: true, deadlines: true },
      });
    });

    it('findOneOrThrow throws NotFoundException when nothing matches', async () => {
      opportunities.findOne.mockResolvedValueOnce(null);
      await expect(service.findOneOrThrow('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('findOneWithDetailsOrThrow throws NotFoundException when nothing matches', async () => {
      opportunities.findOne.mockResolvedValueOnce(null);
      await expect(
        service.findOneWithDetailsOrThrow('missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('update() uses the lean existence check, not the detail load', async () => {
      await service.update('opportunity-1', { title: 'Updated' });

      // Only one findOne call is made, and it must be the lean variant (no relations).
      expect(opportunities.findOne).toHaveBeenCalledTimes(1);
      expect(opportunities.findOne).toHaveBeenCalledWith({
        where: { id: 'opportunity-1' },
      });
    });
  });

  /**
   * F7: findAll() previously eager-loaded sources/requirements/deadlines
   * unconditionally. Production hardening (Batch 4): also now
   * keyset-paginated — see universities.service.spec.ts's doc comment for
   * the fake createQueryBuilder() approach.
   */
  describe('findAll — F7 fix + pagination (Batch 4)', () => {
    beforeEach(() => {
      rows = [
        {
          id: 'opp-1',
          title: 'Older',
          universityId: 'university-1',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: 'opp-2',
          title: 'Newer',
          universityId: 'university-2',
          createdAt: new Date('2026-02-01T00:00:00Z'),
        },
      ];
    });

    it('never requests sources/requirements/deadlines relations (only createQueryBuilder is ever used, no relations/leftJoinAndSelect calls)', async () => {
      await service.findAll({});
      // createQueryBuilder-based reads never carry a `relations` option at
      // all — there is no eager-load path left to accidentally trigger.
      expect(opportunities.createQueryBuilder).toHaveBeenCalledWith(
        'opportunity',
      );
    });

    it('orders newest-first by default, matching the original order', async () => {
      const result = await service.findAll({});
      expect(result.items.map((r: any) => r.id)).toEqual(['opp-2', 'opp-1']);
    });

    it('applies filters when given', async () => {
      const result = await service.findAll({ universityId: 'university-1' });
      expect(result.items.map((r: any) => r.id)).toEqual(['opp-1']);
    });

    it('paginates with a working cursor', async () => {
      const first = await service.findAll({ limit: 1 });
      expect(first.items.map((r: any) => r.id)).toEqual(['opp-2']);
      expect(first.hasNextPage).toBe(true);

      const second = await service.findAll({
        limit: 1,
        cursor: first.nextCursor!,
      });
      expect(second.items.map((r: any) => r.id)).toEqual(['opp-1']);
      expect(second.hasNextPage).toBe(false);
    });
  });

  /** F1: create()/update() previously performed zero relationship validation at all. */
  describe('create — F1 relationship validation', () => {
    it('creates without any relationship check when neither universityId nor programmeId is given', async () => {
      await service.create({ title: 'A scholarship' });

      expect(universitiesService.findOneOrThrow).not.toHaveBeenCalled();
      expect(programmesService.findOneOrThrow).not.toHaveBeenCalled();
      expect(opportunities.save).toHaveBeenCalled();
    });

    it('validates universityId exists', async () => {
      await service.create({
        title: 'A scholarship',
        universityId: 'university-1',
      });

      expect(universitiesService.findOneOrThrow).toHaveBeenCalledWith(
        'university-1',
      );
    });

    it('rejects when universityId does not exist, without creating the opportunity', async () => {
      universitiesService.findOneOrThrow.mockRejectedValueOnce(
        new NotFoundException('University not found'),
      );

      await expect(
        service.create({
          title: 'A scholarship',
          universityId: 'missing',
        } as any),
      ).rejects.toThrow(NotFoundException);
      expect(opportunities.save).not.toHaveBeenCalled();
    });

    it('validates universityId and programmeId concurrently, not sequentially', async () => {
      let universityResolved = false;
      universitiesService.findOneOrThrow.mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        universityResolved = true;
        return { id: 'university-1' };
      });
      programmesService.findOneOrThrow.mockImplementationOnce(async () => {
        // If these ran sequentially (university awaited first), this
        // assertion would fail — the university check hasn't finished yet
        // when this one is invoked, proving Promise.all-style concurrency.
        expect(universityResolved).toBe(false);
        return { id: 'programme-1', universityId: 'university-1' };
      });

      await service.create({
        title: 'A scholarship',
        universityId: 'university-1',
        programmeId: 'programme-1',
      });
    });

    /** F2: the actual cross-consistency check — the audit's specific concern. */
    it('F2 — rejects when programmeId does not belong to universityId', async () => {
      programmesService.findOneOrThrow.mockResolvedValueOnce({
        id: 'programme-1',
        universityId: 'university-OTHER',
      });

      await expect(
        service.create({
          title: 'A scholarship',
          universityId: 'university-1',
          programmeId: 'programme-1',
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(opportunities.save).not.toHaveBeenCalled();
    });

    it('F2 — accepts when programmeId genuinely belongs to universityId', async () => {
      programmesService.findOneOrThrow.mockResolvedValueOnce({
        id: 'programme-1',
        universityId: 'university-1',
      });

      await service.create({
        title: 'A scholarship',
        universityId: 'university-1',
        programmeId: 'programme-1',
      });

      expect(opportunities.save).toHaveBeenCalled();
    });
  });

  describe('update — F1/F2 relationship validation', () => {
    it('does not re-validate universityId/programmeId when the update does not touch either', async () => {
      await service.update('opportunity-1', { title: 'New title' });

      expect(universitiesService.findOneOrThrow).not.toHaveBeenCalled();
      expect(programmesService.findOneOrThrow).not.toHaveBeenCalled();
    });

    it('validates a newly supplied programmeId against the EXISTING (unchanged) universityId', async () => {
      opportunities.findOne.mockResolvedValueOnce({
        id: 'opportunity-1',
        universityId: 'university-1',
        programmeId: null,
      });
      programmesService.findOneOrThrow.mockResolvedValueOnce({
        id: 'programme-1',
        universityId: 'university-OTHER',
      });

      await expect(
        service.update('opportunity-1', { programmeId: 'programme-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('validates the EXISTING (unchanged) programmeId against a newly supplied universityId', async () => {
      // The opportunity already has programmeId set (belonging to
      // university-1); changing ONLY universityId to something else must
      // still be caught, even though programmeId itself isn't in this dto.
      opportunities.findOne.mockResolvedValueOnce({
        id: 'opportunity-1',
        universityId: 'university-1',
        programmeId: 'programme-1',
      });
      programmesService.findOneOrThrow.mockResolvedValueOnce({
        id: 'programme-1',
        universityId: 'university-1', // programme's real, unchanged university
      });

      await expect(
        service.update('opportunity-1', { universityId: 'university-2' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows changing universityId when the opportunity has no programme to conflict with', async () => {
      opportunities.findOne.mockResolvedValueOnce({
        id: 'opportunity-1',
        universityId: 'university-1',
        programmeId: null,
      });

      await service.update('opportunity-1', { universityId: 'university-2' });

      expect(programmesService.findOneOrThrow).not.toHaveBeenCalled();
      expect(opportunities.save).toHaveBeenCalled();
    });
  });
});
