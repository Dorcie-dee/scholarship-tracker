import { BadRequestException } from '@nestjs/common';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

/**
 * One consistent keyset/cursor pagination contract, used by every collection
 * endpoint (Batch 4 — production hardening). Keyset, not offset: an OFFSET-
 * based "page 400 of 10,000" gets linearly slower as the offset grows
 * (Postgres still has to walk and discard every skipped row) and produces
 * duplicate/missing rows if the underlying data changes between page
 * requests — neither problem exists for a keyset cursor, which always
 * resumes exactly "after the last row you saw," in one indexed seek.
 *
 * The cursor is a base64-encoded `{sortValue, id}` pair — opaque to the
 * client (an implementation detail, not an API contract to keep stable
 * forever), decodable server-side into the exact two values a keyset WHERE
 * clause needs. `id` is always the tie-breaker: every entity's `(sortField,
 * id)` pair is unique even when `sortField` alone isn't (e.g. two
 * Universities can share a name), which is what keeps pagination
 * deterministic — see each service's own ordering comment.
 */
export interface DecodedCursor {
  sortValue: string;
  id: string;
}

export function encodeCursor(cursor: DecodedCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): DecodedCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as DecodedCursor).sortValue !== 'string' ||
    typeof (parsed as DecodedCursor).id !== 'string'
  ) {
    throw new BadRequestException('Invalid pagination cursor');
  }
  return parsed as DecodedCursor;
}

/**
 * Clamps a client-requested page size into `[1, maxPageSize]`, defaulting to
 * `defaultPageSize` when unspecified. The one place this decision is made —
 * every service calls this rather than re-implementing the clamp, so
 * `PAGINATION_MAX_PAGE_SIZE` genuinely bounds every endpoint, not just the
 * ones someone remembered to cap. This is what stops a client (malicious or
 * accidental) from requesting `limit=1000000` and forcing an unbounded read.
 */
export function resolvePageSize(
  requested: number | undefined,
  config: { defaultPageSize: number; maxPageSize: number },
): number {
  if (requested === undefined) {
    return config.defaultPageSize;
  }
  return Math.min(Math.max(requested, 1), config.maxPageSize);
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

/**
 * Applies the standard `(sortColumn, id)` keyset WHERE + ORDER BY + fetch-
 * one-extra to a TypeORM QueryBuilder — the one place this shape is written,
 * reused by every paginated service instead of each reimplementing its own
 * comparison operators (easy to get backwards for DESC order, which is
 * exactly the kind of subtle bug worth only writing once). `sortColumn` must
 * be a real, already-`SELECT`ed column reference (e.g. `'university.name'`)
 * — the caller's responsibility, since only it knows its own alias.
 */
export function applyKeysetPagination<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  sortColumn: string,
  idColumn: string,
  direction: 'ASC' | 'DESC',
  cursor: DecodedCursor | undefined,
  limit: number,
): SelectQueryBuilder<T> {
  if (cursor) {
    const op = direction === 'ASC' ? '>' : '<';
    qb.andWhere(
      `(${sortColumn} ${op} :cursorSortValue) OR (${sortColumn} = :cursorSortValue AND ${idColumn} ${op} :cursorId)`,
      { cursorSortValue: cursor.sortValue, cursorId: cursor.id },
    );
  }
  return qb
    .orderBy(sortColumn, direction)
    .addOrderBy(idColumn, direction)
    .take(limit + 1);
}

/**
 * Given `limit + 1` rows actually fetched (the standard "fetch one extra to
 * know if there's a next page" trick — avoids a separate COUNT query), slices
 * back down to `limit` and builds the cursor from the last returned row.
 */
export function buildPaginatedResult<T>(
  rows: T[],
  limit: number,
  getSortValue: (row: T) => string,
  getId: (row: T) => string,
): PaginatedResult<T> {
  const hasNextPage = rows.length > limit;
  const items = hasNextPage ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    hasNextPage,
    nextCursor:
      hasNextPage && last
        ? encodeCursor({ sortValue: getSortValue(last), id: getId(last) })
        : null,
  };
}
