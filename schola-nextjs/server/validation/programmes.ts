import { z } from 'zod';
import { StudyLevel } from '../lib/enums';
import { FREE_TEXT_MAX_LENGTH, SHORT_TEXT_MAX_LENGTH } from '../lib/text-limits';
import { objectIdField, paginationQuerySchema } from './common';

/** Ported from the original NestJS backend's `CreateProgrammeDto`/`UpdateProgrammeDto`. */
export const createProgrammeSchema = z
  .object({
    universityId: objectIdField('universityId'),
    name: z.string().trim().min(1).max(SHORT_TEXT_MAX_LENGTH),
    studyLevel: z.nativeEnum(StudyLevel).optional(),
    field: z.string().max(SHORT_TEXT_MAX_LENGTH).optional(),
    duration: z.string().max(100).optional(),
    website: z.string().url().max(512).optional(),
    notes: z.string().max(FREE_TEXT_MAX_LENGTH).optional(),
  })
  .strict();

export type CreateProgrammeInput = z.infer<typeof createProgrammeSchema>;

export const updateProgrammeSchema = createProgrammeSchema.partial().strict();

export type UpdateProgrammeInput = z.infer<typeof updateProgrammeSchema>;

export const listProgrammesQuerySchema = paginationQuerySchema
  .extend({
    universityId: objectIdField('universityId').optional(),
  })
  .strict();

export type ListProgrammesQuery = z.infer<typeof listProgrammesQuerySchema>;
