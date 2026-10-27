import { z } from 'zod';
import { OpportunitySourceType, SourceAuthorityLevel } from '../lib/enums';
import { EXCERPT_MAX_LENGTH, FREE_TEXT_MAX_LENGTH, SHORT_TEXT_MAX_LENGTH } from '../lib/text-limits';
import { isoDateString, objectIdField, paginationQuerySchema } from './common';

/** Ported from the original NestJS backend's `CreateOpportunitySourceDto`. */
export const createOpportunitySourceSchema = z
  .object({
    opportunityId: objectIdField('opportunityId'),
    sourceType: z.nativeEnum(OpportunitySourceType).optional(),
    sourceName: z.string().max(SHORT_TEXT_MAX_LENGTH).optional(),
    sourceUrl: z.string().url().max(1024).optional(),
    capturedAt: isoDateString.optional(),
    publishedAt: isoDateString.optional(),
    /** The relevant excerpt used at capture time — never a full page archive. */
    extractedContent: z.string().max(EXCERPT_MAX_LENGTH).optional(),
    authorityLevel: z.nativeEnum(SourceAuthorityLevel).optional(),
    notes: z.string().max(FREE_TEXT_MAX_LENGTH).optional(),
    /**
     * When true and `sourceUrl` is set, the server fetches the page
     * (SSRF-safe) and fills `extractedContent`/`sourceName` only when those
     * were left empty.
     */
    autoFetch: z.boolean().optional(),
  })
  .strict();

export type CreateOpportunitySourceInput = z.infer<typeof createOpportunitySourceSchema>;

/** Update never accepts `autoFetch` — that is create-only, same as the original `UpdateOpportunitySourceDto`. */
export const updateOpportunitySourceSchema = createOpportunitySourceSchema
  .omit({ autoFetch: true })
  .partial()
  .strict();

export type UpdateOpportunitySourceInput = z.infer<typeof updateOpportunitySourceSchema>;

export const listOpportunitySourcesQuerySchema = paginationQuerySchema
  .extend({
    opportunityId: objectIdField('opportunityId').optional(),
  })
  .strict();

export type ListOpportunitySourcesQuery = z.infer<typeof listOpportunitySourcesQuerySchema>;

export const fetchUrlPreviewSchema = z
  .object({
    url: z.string().url('Enter a valid http(s) URL').max(1024),
  })
  .strict();

export type FetchUrlPreviewInput = z.infer<typeof fetchUrlPreviewSchema>;
