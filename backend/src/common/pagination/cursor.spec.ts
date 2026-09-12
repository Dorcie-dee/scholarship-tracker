import { BadRequestException } from '@nestjs/common';
import {
  applyKeysetPagination,
  buildPaginatedResult,
  decodeCursor,
  encodeCursor,
  resolvePageSize,
} from './cursor';

describe('cursor pagination utilities', () => {
  describe('encodeCursor / decodeCursor', () => {
    it('round-trips a cursor exactly', () => {
      const cursor = encodeCursor({ sortValue: 'Twente', id: 'uni-1' });
      expect(decodeCursor(cursor)).toEqual({
        sortValue: 'Twente',
        id: 'uni-1',
      });
    });

    it('rejects a malformed (non-base64/non-JSON) cursor with a clean 400', () => {
      expect(() => decodeCursor('not-a-real-cursor!!!')).toThrow(
        BadRequestException,
      );
    });

    it('rejects a cursor decoding to the wrong shape', () => {
      const badCursor = Buffer.from(
        JSON.stringify({ somethingElse: true }),
        'utf8',
      ).toString('base64url');
      expect(() => decodeCursor(badCursor)).toThrow(BadRequestException);
    });
  });

  describe('resolvePageSize', () => {
    const config = { defaultPageSize: 25, maxPageSize: 100 };

    it('uses the default when unspecified', () => {
      expect(resolvePageSize(undefined, config)).toBe(25);
    });

    it('clamps a request above the max down to the max — this is what stops an unbounded read', () => {
      expect(resolvePageSize(1_000_000, config)).toBe(100);
    });

    it('clamps a request below 1 up to 1', () => {
      expect(resolvePageSize(0, config)).toBe(1);
      expect(resolvePageSize(-50, config)).toBe(1);
    });

    it('passes through a valid in-range request unchanged', () => {
      expect(resolvePageSize(10, config)).toBe(10);
    });
  });

  describe('buildPaginatedResult', () => {
    const rows = [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Bravo' },
      { id: 'c', name: 'Charlie' },
    ];

    it('reports hasNextPage=false and no cursor when fewer rows than limit+1 are returned', () => {
      const result = buildPaginatedResult(
        rows,
        5,
        (r) => r.name,
        (r) => r.id,
      );
      expect(result.items).toHaveLength(3);
      expect(result.hasNextPage).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('reports hasNextPage=true, slices back to limit, and builds the cursor from the LAST returned item', () => {
      // limit=2 with 3 rows fetched (the "fetch one extra" trick).
      const result = buildPaginatedResult(
        rows,
        2,
        (r) => r.name,
        (r) => r.id,
      );
      expect(result.items).toHaveLength(2);
      expect(result.items.map((r) => r.id)).toEqual(['a', 'b']);
      expect(result.hasNextPage).toBe(true);
      expect(decodeCursor(result.nextCursor as string)).toEqual({
        sortValue: 'Bravo',
        id: 'b',
      });
    });
  });

  describe('applyKeysetPagination', () => {
    const makeQb = () => {
      const qb: any = {};
      for (const method of ['andWhere', 'orderBy', 'addOrderBy', 'take']) {
        qb[method] = jest.fn(() => qb);
      }
      return qb;
    };

    it('applies no WHERE clause when there is no cursor (first page)', () => {
      const qb = makeQb();
      applyKeysetPagination(qb, 'u.name', 'u.id', 'ASC', undefined, 25);

      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(qb.orderBy).toHaveBeenCalledWith('u.name', 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('u.id', 'ASC');
      expect(qb.take).toHaveBeenCalledWith(26); // limit + 1
    });

    it('uses ">" comparisons for ASC order', () => {
      const qb = makeQb();
      applyKeysetPagination(
        qb,
        'u.name',
        'u.id',
        'ASC',
        { sortValue: 'Alpha', id: 'a' },
        25,
      );

      const [predicate] = qb.andWhere.mock.calls[0];
      expect(predicate).toContain('>');
      expect(predicate).not.toContain('<');
    });

    it('uses "<" comparisons for DESC order', () => {
      const qb = makeQb();
      applyKeysetPagination(
        qb,
        'a.createdAt',
        'a.id',
        'DESC',
        { sortValue: '2026-01-01', id: 'a' },
        25,
      );

      const [predicate] = qb.andWhere.mock.calls[0];
      expect(predicate).toContain('<');
      expect(predicate).not.toContain('>');
    });
  });
});
