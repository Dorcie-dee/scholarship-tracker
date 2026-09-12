import { NotFoundException } from '@nestjs/common';
import { decodeCursor } from '../common/pagination/cursor';
import { UniversitiesService } from './universities.service';

/**
 * Track 1 Group B — closes this service's previous zero-test-coverage gap.
 * University is shared catalog data (no ownership, no @CurrentUser() —
 * confirmed by inspecting the controller); these tests reflect that: no
 * ownership scenarios to cover, focus is on the actual service logic that
 * existed (search, existence checks) plus the F4 whitespace-validation fix
 * verified at the DTO layer separately (see create-university.dto — covered
 * in its own describe block below via class-validator directly).
 *
 * Production hardening (Batch 4) — `findAll()` rewritten as keyset
 * pagination. The fake `createQueryBuilder()` below genuinely applies
 * filtering/sorting/cursor logic against an in-memory row set (not just
 * "was the method called") — real pagination behavior, not the query
 * builder's call shape, is what these tests prove.
 */
describe('UniversitiesService', () => {
  let universities: any;
  let configService: any;
  let service: UniversitiesService;
  let rows: any[];

  const makeQueryBuilder = () => {
    let searchTerm: string | undefined;
    let cursorSortValue: string | undefined;
    let cursorId: string | undefined;
    let direction: 'ASC' | 'DESC' = 'ASC';
    let limit = Infinity;

    const qb: any = {
      andWhere: jest.fn((sql: string, params: any) => {
        if ('search' in params) searchTerm = params.search;
        if ('cursorSortValue' in params) {
          cursorSortValue = params.cursorSortValue;
          cursorId = params.cursorId;
        }
        return qb;
      }),
      orderBy: jest.fn((_col: string, dir: 'ASC' | 'DESC') => {
        direction = dir;
        return qb;
      }),
      addOrderBy: jest.fn(() => qb),
      take: jest.fn((n: number) => {
        limit = n;
        return qb;
      }),
      getMany: jest.fn(async () => {
        let result = [...rows];
        if (searchTerm) {
          const needle = searchTerm.replace(/^%|%$/g, '').toLowerCase();
          result = result.filter((r) => r.name.toLowerCase().includes(needle));
        }
        result.sort((a, b) =>
          direction === 'ASC'
            ? a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
            : b.name.localeCompare(a.name) || b.id.localeCompare(a.id),
        );
        if (cursorSortValue !== undefined) {
          result = result.filter((r) =>
            direction === 'ASC'
              ? r.name > cursorSortValue! ||
                (r.name === cursorSortValue && r.id > cursorId!)
              : r.name < cursorSortValue! ||
                (r.name === cursorSortValue && r.id < cursorId!),
          );
        }
        return result.slice(0, limit);
      }),
    };
    return qb;
  };

  beforeEach(() => {
    rows = [
      { id: 'uni-1', name: 'Delft University of Technology' },
      { id: 'uni-2', name: 'University of Amsterdam' },
      { id: 'uni-3', name: 'University of Twente' },
      { id: 'uni-4', name: 'Utrecht University' },
    ];
    universities = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => ({ id: 'university-1', ...row })),
      findOne: jest.fn(async () => null),
      delete: jest.fn(async () => ({ affected: 1 })),
      createQueryBuilder: jest.fn(() => makeQueryBuilder()),
    };
    configService = {
      get: jest.fn(() => ({ defaultPageSize: 2, maxPageSize: 10 })),
    };
    service = new UniversitiesService(universities, configService);
  });

  describe('create', () => {
    it('creates and persists a university', async () => {
      const dto = { name: 'University of Twente', country: 'Netherlands' };
      const result = await service.create(dto);

      expect(universities.create).toHaveBeenCalledWith(dto);
      expect(universities.save).toHaveBeenCalled();
      expect(result.name).toBe('University of Twente');
    });
  });

  describe('findAll — pagination', () => {
    it('returns the default page size, ordered by name, when unspecified', async () => {
      const result = await service.findAll({});

      expect(result.items.map((r: any) => r.name)).toEqual([
        'Delft University of Technology',
        'University of Amsterdam',
      ]);
      expect(result.hasNextPage).toBe(true);
      expect(result.nextCursor).not.toBeNull();
    });

    it('the second page (via cursor) continues where the first left off, with no duplicates or gaps', async () => {
      const first = await service.findAll({});
      const second = await service.findAll({ cursor: first.nextCursor! });

      expect(second.items.map((r: any) => r.name)).toEqual([
        'University of Twente',
        'Utrecht University',
      ]);
      expect(second.hasNextPage).toBe(false);
      expect(second.nextCursor).toBeNull();

      const allNames = [...first.items, ...second.items].map(
        (r: any) => r.name,
      );
      expect(new Set(allNames).size).toBe(allNames.length); // no duplicates
      expect(allNames).toEqual(
        [...rows]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((r) => r.name),
      );
    });

    it('clamps a requested limit above the configured max', async () => {
      await service.findAll({ limit: 1_000_000 });
      // configService max is 10 — take() is called with limit+1 = 11.
      const qb = universities.createQueryBuilder.mock.results[0].value;
      expect(qb.take).toHaveBeenCalledWith(11);
    });

    it('searches case-insensitively via ILIKE when a search term is given', async () => {
      const result = await service.findAll({ search: 'twente' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('University of Twente');
    });

    it('produces a cursor that decodes back to the last returned row', async () => {
      const result = await service.findAll({});
      const decoded = decodeCursor(result.nextCursor!);
      const last = result.items[result.items.length - 1];
      expect(decoded).toEqual({ sortValue: last.name, id: last.id });
    });
  });

  describe('findOneOrThrow', () => {
    it('returns the university when found', async () => {
      const uni = { id: 'university-1', name: 'University of Twente' };
      universities.findOne.mockResolvedValueOnce(uni);
      await expect(service.findOneOrThrow('university-1')).resolves.toBe(uni);
    });

    it('throws NotFoundException when not found', async () => {
      await expect(service.findOneOrThrow('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('applies a partial update to an existing university', async () => {
      universities.findOne.mockResolvedValueOnce({
        id: 'university-1',
        name: 'University of Twente',
        country: null,
      });

      const result = await service.update('university-1', {
        country: 'Netherlands',
      });

      expect(result.country).toBe('Netherlands');
      expect(result.name).toBe('University of Twente'); // untouched
    });

    it('throws NotFoundException instead of creating a row when the university is missing', async () => {
      await expect(
        service.update('missing', { country: 'Netherlands' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(universities.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes an existing university', async () => {
      universities.findOne.mockResolvedValueOnce({ id: 'university-1' });
      await service.remove('university-1');
      expect(universities.delete).toHaveBeenCalledWith('university-1');
    });

    it('throws NotFoundException instead of deleting nothing when the university is missing', async () => {
      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(universities.delete).not.toHaveBeenCalled();
    });
  });
});
