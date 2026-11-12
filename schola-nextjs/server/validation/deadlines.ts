import { z } from 'zod';
import { DeadlineStatus, DeadlineType } from '../lib/enums';
import { FREE_TEXT_MAX_LENGTH } from '../lib/text-limits';
import { isoDateString, objectId, paginationQueryFields } from './common';

/** Ported from `deadlines/dto/create-deadline.dto.ts`. */
export const createDeadlineSchema = z
  .object({
    label: z.string().trim().min(1).max(255),
    deadlineType: z.nativeEnum(DeadlineType).optional(),
    date: isoDateString,
    status: z.nativeEnum(DeadlineStatus).optional(),
    opportunityId: objectId.optional(),
    applicationId: objectId.optional(),
    taskId: objectId.optional(),
    requirementId: objectId.optional(),
    notes: z.string().max(FREE_TEXT_MAX_LENGTH).optional(),
  })
  .strict();

export type CreateDeadlineInput = z.infer<typeof createDeadlineSchema>;

export const updateDeadlineSchema = createDeadlineSchema.partial().strict();

export type UpdateDeadlineInput = z.infer<typeof updateDeadlineSchema>;

export const listDeadlinesQuerySchema = z
  .object({
    opportunityId: objectId.optional(),
    applicationId: objectId.optional(),
    taskId: objectId.optional(),
    requirementId: objectId.optional(),
    order: z.enum(['asc', 'desc']).optional(),
    ...paginationQueryFields,
  })
  .strict();

export type ListDeadlinesQuery = z.infer<typeof listDeadlinesQuerySchema>;
