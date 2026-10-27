import { z } from 'zod';
import { JourneyStatus } from '../lib/enums';
import { FREE_TEXT_MAX_LENGTH } from '../lib/text-limits';
import { objectIdField, paginationQuerySchema } from './common';

/**
 * Ported from the NestJS backend's `journeys/dto/create-journey.dto.ts` +
 * `update-journey.dto.ts` (a `PartialType` of the create DTO). `.strict()`
 * everywhere, matching the original's global `ValidationPipe({ whitelist:
 * true, forbidNonWhitelisted: true })` — unknown fields are a 400, not
 * silently dropped.
 */
export const createJourneySchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    goal: z.string().max(FREE_TEXT_MAX_LENGTH).optional(),
    status: z.nativeEnum(JourneyStatus).optional(),
    universityId: objectIdField('universityId').optional(),
    programmeId: objectIdField('programmeId').optional(),
    notes: z.string().max(FREE_TEXT_MAX_LENGTH).optional(),
  })
  .strict();

export const updateJourneySchema = createJourneySchema.partial().strict();

export const listJourneysQuerySchema = paginationQuerySchema.strict();

export type CreateJourneyInput = z.infer<typeof createJourneySchema>;
export type UpdateJourneyInput = z.infer<typeof updateJourneySchema>;
export type ListJourneysQuery = z.infer<typeof listJourneysQuerySchema>;
