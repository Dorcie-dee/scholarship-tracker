import { z } from 'zod';
import { ApplicationStatus, ApplicationType } from '../lib/enums';
import { FREE_TEXT_MAX_LENGTH } from '../lib/text-limits';
import { isoDateString, objectIdField, paginationQuerySchema } from './common';

/**
 * Ported from `applications/dto/create-application.dto.ts`,
 * `update-application.dto.ts` (`PartialType` of create) and
 * `list-applications-query.dto.ts`. `startDate`/`submissionDate` match the
 * original's `@IsDateString()` (ISO-8601 date or date-time string) — the
 * model stores them as plain strings (Mongo has no Postgres `date` type).
 */
export const createApplicationSchema = z
  .object({
    journeyId: objectIdField('journeyId'),
    title: z.string().trim().min(1).max(255),
    applicationType: z.nativeEnum(ApplicationType).optional(),
    status: z.nativeEnum(ApplicationStatus).optional(),
    opportunityId: objectIdField('opportunityId').optional(),
    startDate: isoDateString.optional(),
    submissionDate: isoDateString.optional(),
    portal: z.string().max(255).optional(),
    externalUrl: z.string().url().max(1024).optional(),
    notes: z.string().max(FREE_TEXT_MAX_LENGTH).optional(),
  })
  .strict();

export const updateApplicationSchema = createApplicationSchema.partial().strict();

export const listApplicationsQuerySchema = paginationQuerySchema
  .extend({
    journeyId: objectIdField('journeyId').optional(),
  })
  .strict();

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>;
