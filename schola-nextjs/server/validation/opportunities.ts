import { z } from 'zod';
import { OpportunityType, StudyLevel } from '../lib/enums';
import { FREE_TEXT_MAX_LENGTH, SHORT_TEXT_MAX_LENGTH } from '../lib/text-limits';
import { objectIdField, paginationQuerySchema } from './common';

/**
 * Ported from the original NestJS backend's `CreateOpportunityDto`/
 * `UpdateOpportunityDto`. `metadata` is deliberately left without a
 * shape/size bound beyond "is a plain object" — see the original DTO's own
 * comment (Batch 8): unbounded by design for this phase, only the global
 * request body limit applies.
 */
export const createOpportunitySchema = z
  .object({
    title: z.string().trim().min(1).max(SHORT_TEXT_MAX_LENGTH),
    provider: z.string().max(SHORT_TEXT_MAX_LENGTH).optional(),
    opportunityType: z.nativeEnum(OpportunityType).optional(),
    country: z.string().max(SHORT_TEXT_MAX_LENGTH).optional(),
    fundingType: z.string().max(100).optional(),
    // Non-negative number with up to 2 decimal places — matches the
    // original numeric(12,2) column and its @Matches() validator (a plain
    // @IsNumberString() alone would have allowed negative values).
    fundingAmount: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, 'fundingAmount must be a non-negative number with up to 2 decimal places')
      .optional(),
    currency: z.string().max(10).optional(),
    duration: z.string().max(100).optional(),
    studyLevel: z.nativeEnum(StudyLevel).optional(),
    field: z.string().max(SHORT_TEXT_MAX_LENGTH).optional(),
    eligibilitySummary: z.string().max(FREE_TEXT_MAX_LENGTH).optional(),
    applicationMethod: z.string().max(SHORT_TEXT_MAX_LENGTH).optional(),
    applicationUrl: z.string().url().max(1024).optional(),
    universityId: objectIdField('universityId').optional(),
    programmeId: objectIdField('programmeId').optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;

export const updateOpportunitySchema = createOpportunitySchema.partial().strict();

export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;

export const listOpportunitiesQuerySchema = paginationQuerySchema
  .extend({
    studyLevel: z.nativeEnum(StudyLevel).optional(),
    country: z.string().max(SHORT_TEXT_MAX_LENGTH).optional(),
    opportunityType: z.nativeEnum(OpportunityType).optional(),
    universityId: objectIdField('universityId').optional(),
    programmeId: objectIdField('programmeId').optional(),
    /**
     * Comma-separated id list for a bulk "give me exactly these" lookup
     * (e.g. a dashboard resolving every distinct `opportunityId` its
     * applications reference in one call instead of one per application).
     * Parsed/validated in `opportunities.service.ts#listOpportunities`.
     */
    ids: z.string().max(2_000).optional(),
  })
  .strict();

export type ListOpportunitiesQuery = z.infer<typeof listOpportunitiesQuerySchema>;
