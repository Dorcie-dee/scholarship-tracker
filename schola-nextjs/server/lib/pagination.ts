import type { Model, FilterQuery, Types } from 'mongoose';
import { getConfig } from './config';
import { BadRequestError } from './http-errors';

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

interface CursorPayload {
  v: string | number; // the sort field's value at the last row of the previous page
  id: string; // that row's _id, as a tiebreaker for equal sort values
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursor: string): CursorPayload {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('id' in parsed) ||
      !('v' in parsed)
    ) {
      throw new Error('malformed cursor');
    }
    return parsed as CursorPayload;
  } catch {
    throw new BadRequestError('Invalid pagination cursor');
  }
}

/**
 * Keyset (not offset) pagination — ported from the NestJS backend's
 * `common/pagination/cursor.ts`. Sorts on `(sortField, _id)` ascending or
 * descending and filters with the keyset predicate
 * `(sortField > cursor.v) OR (sortField == cursor.v AND _id > cursor.id)`
 * (flipped for descending), which stays correct and index-friendly under
 * concurrent inserts/deletes — unlike offset `skip()`, which can skip or
 * repeat rows when the underlying set changes between pages.
 */
export async function paginate<T extends { _id: Types.ObjectId }>(
  model: Model<T>,
  options: {
    filter?: FilterQuery<T>;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
    cursor?: string | null;
    limit?: number | string | null;
  },
): Promise<PaginatedResult<T>> {
  const { pagination } = getConfig();
  const sortField = options.sortField ?? 'createdAt';
  const sortOrder = options.sortOrder ?? 'desc';
  const direction = sortOrder === 'asc' ? 1 : -1;

  const rawLimit =
    typeof options.limit === 'string' ? Number(options.limit) : options.limit;
  const limit = Math.min(
    Math.max(1, Number.isFinite(rawLimit) && rawLimit ? (rawLimit as number) : pagination.defaultPageSize),
    pagination.maxPageSize,
  );

  const filter: FilterQuery<T> = { ...(options.filter ?? {}) };

  if (options.cursor) {
    const { v, id } = decodeCursor(options.cursor);
    const cmp = direction === 1 ? '$gt' : '$lt';
    const keysetClause = {
      $or: [
        { [sortField]: { [cmp]: v } },
        { [sortField]: v, _id: { [cmp]: id } },
      ],
    } as FilterQuery<T>;
    Object.assign(filter, filter.$and ? {} : {});
    (filter as Record<string, unknown>).$and = [
      ...((filter as Record<string, unknown>).$and as unknown[] | undefined ?? []),
      keysetClause,
    ];
  }

  const docs = await model
    .find(filter)
    .sort({ [sortField]: direction, _id: direction } as Record<string, 1 | -1>)
    .limit(limit + 1)
    .exec();

  const hasNextPage = docs.length > limit;
  const items = hasNextPage ? docs.slice(0, limit) : docs;
  const last = items[items.length - 1] as (T & Record<string, unknown>) | undefined;

  const nextCursor =
    hasNextPage && last
      ? encodeCursor({ v: last[sortField] as string | number, id: String(last._id) })
      : null;

  return { items, nextCursor, hasNextPage };
}
