import { z } from 'zod';
import { RequirementStatus, RequirementType } from '../lib/enums';
import { FREE_TEXT_MAX_LENGTH } from '../lib/text-limits';
import { objectId, paginationQueryFields } from './common';

/** Ported from `requirements/dto/create-requirement.dto.ts`. */
export const createRequirementSchema = z
  .object({
    requirementType: z.nativeEnum(RequirementType),
    description: z.string().trim().min(1).max(FREE_TEXT_MAX_LENGTH),
    status: z.nativeEnum(RequirementStatus).optional(),
    opportunityId: objectId.optional(),
    applicationId: objectId.optional(),
    notes: z.string().max(FREE_TEXT_MAX_LENGTH).optional(),
  })
  .strict();

export type CreateRequirementInput = z.infer<typeof createRequirementSchema>;

export const updateRequirementSchema = createRequirementSchema.partial().strict();

export type UpdateRequirementInput = z.infer<typeof updateRequirementSchema>;

export const listRequirementsQuerySchema = z
  .object({
    opportunityId: objectId.optional(),
    applicationId: objectId.optional(),
    order: z.enum(['asc', 'desc']).optional(),
    ...paginationQueryFields,
  })
  .strict();

export type ListRequirementsQuery = z.infer<typeof listRequirementsQuerySchema>;
