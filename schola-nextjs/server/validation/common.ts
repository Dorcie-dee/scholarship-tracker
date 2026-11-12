import { Types } from 'mongoose';
import { z } from 'zod';
import { CURSOR_MAX_LENGTH } from '../lib/text-limits';

/**
 * Shared, cross-module zod helpers for `server/validation/*`. Several
 * catalog/application modules are being ported in parallel against this one
 * file — the exports below deliberately cover both naming/shape
 * conventions already in use elsewhere in `server/validation/` (a plain
 * `objectId` schema + a spreadable `paginationQueryFields` fragment, and a
 * labeled `objectIdField()` factory + a ready-to-`.extend()`
 * `paginationQuerySchema`) so neither set of call sites breaks.
 */

/** True when `id` is a syntactically valid Mongo ObjectId string. */
export function isValidObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id);
}

/** Mongo ObjectId string — the zod equivalent of the original `@IsUUID()`. */
export const objectId = z.string().refine((value) => isValidObjectId(value), 'Must be a valid id');

/** Same validation as `objectId`, with a field-specific error message. */
export function objectIdField(label = 'id') {
  return z.string().refine((value) => isValidObjectId(value), {
    message: `${label} must be a valid id`,
  });
}

/** Lenient ISO-8601 date/datetime string check — the zod equivalent of class-validator's `@IsDateString()`. */
export const isoDateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Must be a valid date string');

/**
 * Spreadable pagination query fragment: `z.object({ ...paginationQueryFields, myFilter: ... })`.
 * `limit` is left as an (optional) string here — `server/lib/pagination.ts`'s `paginate()` accepts
 * either a `string` or a `number` and does its own clamping against `pagination.maxPageSize`.
 */
export const paginationQueryFields = {
  cursor: z.string().max(CURSOR_MAX_LENGTH).optional(),
  limit: z.string().optional(),
};

/**
 * Same pagination fields as `paginationQueryFields`, pre-built as a base object (including `order`)
 * for the `paginationQuerySchema.extend({ myFilter: ... })` call-site style. `limit` is coerced to a
 * number here so an invalid value 400s at the validation layer rather than silently falling back to
 * the default page size inside `paginate()`.
 */
export const paginationQuerySchema = z.object({
  cursor: z.string().max(CURSOR_MAX_LENGTH).optional(),
  limit: z.coerce.number().int().min(1).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});
