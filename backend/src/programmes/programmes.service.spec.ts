import { NotFoundException } from '@nestjs/common';
import { ProgrammesService } from './programmes.service';

/**
 * Track 1 Group B — closes this service's previous zero-test-coverage gap.
 * Production hardening (Batch 4) — `findAll()` rewritten as keyset
 * pagination; see universities.service.spec.ts's doc comment for the fake
 * `createQueryBuilder()` approach used here too.
 */
describe('ProgrammesService', () => {
  let programmes: any;
  let universitiesService: any;
  let configService: any;
  let service: ProgrammesService;
  let rows: any[];

  const makeQueryBuilder = () => {
    let universityId: string | undefined;
    let cursorSortValue: string | undefined;
    let cursorId: string | undefined;
    let limit = Infinity;

    const qb: any = {
      andWhere: jest.fn((_sql: string, params: any) => {
        if ('universityId' in params) universityId = params.universityId;
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
        if (universityId) {
          result = result.filter((r) => r.universityId === universityId);
        }
        result.sort(
          (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
        );
        if (cursorSortValue !== undefined) {
          result = result.filter(
            (r) =>
              r.name > cursorSortValue! ||
              (r.name === cursorSortValue && r.id > cursorId!),
          );
        }
        return result.slice(0, limit);
      }),
    };
    return qb;
  };

  beforeEach(() => {
    rows = [];
    programmes = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => ({ id: 'programme-1', ...row })),
      findOne: jest.fn(async () => null),
      delete: jest.fn(async () => ({ affected: 1 })),
      createQueryBuilder: jest.fn(() => makeQueryBuilder()),
    };
    universitiesService = {
      findOneOrThrow: jest.fn(async (id: string) => ({
        id,
        name: 'University',
      })),
    };
    configService = {
      get: jest.fn(() => ({ defaultPageSize: 25, maxPageSize: 100 })),
    };
    service = new ProgrammesService(
      programmes,
      universitiesService,
      configService,
    );
  });

  describe('create', () => {
    it('validates the university exists before creating the programme', async () => {
      const dto = {
        universityId: 'university-1',
        name: 'MSc Computer Science',
      };
      await service.create(dto);

      expect(universitiesService.findOneOrThrow).toHaveBeenCalledWith(
        'university-1',
      );
      expect(programmes.save).toHaveBeenCalled();
    });

    it('rejects when the university does not exist, without creating the programme', async () => {
      universitiesService.findOneOrThrow.mockRejectedValueOnce(
        new NotFoundException('University not found'),
      );

      await expect(
        service.create({
          universityId: 'missing',
          name: 'MSc Computer Science',
        } as any),
      ).rejects.toThrow(NotFoundException);
      expect(programmes.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll — pagination', () => {
    beforeEach(() => {
      rows = [
        { id: 'p-1', name: 'MSc AI', universityId: 'university-1' },
        {
          id: 'p-2',
          name: 'MSc Computer Science',
          universityId: 'university-1',
        },
        { id: 'p-3', name: 'BSc Physics', universityId: 'university-2' },
      ];
    });

    it('filters by universityId when given', async () => {
      const result = await service.findAll({ universityId: 'university-1' });
      expect(result.items.map((r: any) => r.id)).toEqual(['p-1', 'p-2']);
    });

    it('lists every programme, ordered by name, when no filter is given', async () => {
      const result = await service.findAll({});
      expect(result.items.map((r: any) => r.name)).toEqual([
        'BSc Physics',
        'MSc AI',
        'MSc Computer Science',
      ]);
    });

    it('paginates correctly across a cursor boundary with no duplicates', async () => {
      const first = await service.findAll({ limit: 2 });
      expect(first.items).toHaveLength(2);
      expect(first.hasNextPage).toBe(true);

      const second = await service.findAll({
        limit: 2,
        cursor: first.nextCursor!,
      });
      expect(second.hasNextPage).toBe(false);

      const allIds = [...first.items, ...second.items].map((r: any) => r.id);
      expect(new Set(allIds).size).toBe(3);
    });
  });

  describe('update', () => {
    it('leaves universityId unvalidated (and unchanged) when the DTO does not touch it', async () => {
      programmes.findOne.mockResolvedValueOnce({
        id: 'programme-1',
        universityId: 'university-1',
        name: 'MSc Computer Science',
      });

      await service.update('programme-1', { name: 'MSc AI' });

      expect(universitiesService.findOneOrThrow).not.toHaveBeenCalled();
    });

    it('re-validates the university when universityId IS being changed — a Programme cannot be silently re-parented to a nonexistent university', async () => {
      programmes.findOne.mockResolvedValueOnce({
        id: 'programme-1',
        universityId: 'university-1',
        name: 'MSc Computer Science',
      });

      await service.update('programme-1', {
        universityId: 'university-2',
      });

      expect(universitiesService.findOneOrThrow).toHaveBeenCalledWith(
        'university-2',
      );
    });

    it('throws NotFoundException instead of creating a row when the programme is missing', async () => {
      await expect(
        service.update('missing', { name: 'MSc AI' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(programmes.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes an existing programme', async () => {
      programmes.findOne.mockResolvedValueOnce({ id: 'programme-1' });
      await service.remove('programme-1');
      expect(programmes.delete).toHaveBeenCalledWith('programme-1');
    });

    it('throws NotFoundException instead of deleting nothing when the programme is missing', async () => {
      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(programmes.delete).not.toHaveBeenCalled();
    });
  });
});
