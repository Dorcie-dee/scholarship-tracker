import { z } from 'zod';
import { FREE_TEXT_MAX_LENGTH, SHORT_TEXT_MAX_LENGTH } from '../lib/text-limits';
import { paginationQuerySchema } from './common';

/**
 * Universities are shared reference/catalog data — see
 * `docs/decisions.md`, "Catalog data vs. owned data" — ported from the
 * original NestJS backend's `CreateUniversityDto`/`UpdateUniversityDto`.
 */
export const createUniversitySchema = z
  .object({
    name: z.string().trim().min(1).max(SHORT_TEXT_MAX_LENGTH),
    country: z.string().max(SHORT_TEXT_MAX_LENGTH).optional(),
    website: z.string().url().max(512).optional(),
    notes: z.string().max(FREE_TEXT_MAX_LENGTH).optional(),
  })
  .strict();

export type CreateUniversityInput = z.infer<typeof createUniversitySchema>;

export const updateUniversitySchema = createUniversitySchema.partial().strict();

export type UpdateUniversityInput = z.infer<typeof updateUniversitySchema>;

export const listUniversitiesQuerySchema = paginationQuerySchema
  .extend({
    search: z.string().max(SHORT_TEXT_MAX_LENGTH).optional(),
  })
  .strict();

export type ListUniversitiesQuery = z.infer<typeof listUniversitiesQuerySchema>;
