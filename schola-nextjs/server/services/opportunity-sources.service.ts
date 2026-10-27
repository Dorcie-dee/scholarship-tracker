import type { FilterQuery, HydratedDocument } from 'mongoose';
import { OpportunitySource, type OpportunitySourceDoc } from '../models/opportunity-source.model';
import { ContentOrigin } from '../lib/enums';
import { BadRequestError, NotFoundError } from '../lib/http-errors';
import { fetchUrlPreview, type FetchedUrlPreview } from '../lib/url-fetch';
import { paginate, type PaginatedResult } from '../lib/pagination';
import { isValidObjectId } from '../validation/common';
import type {
  CreateOpportunitySourceInput,
  ListOpportunitySourcesQuery,
  UpdateOpportunitySourceInput,
} from '../validation/opportunity-sources';
import { getOpportunityOrThrow } from './opportunities.service';

/**
 * Ported from the original NestJS backend's `OpportunitySourcesService`.
 * Full CRUD here is deliberately open to any authenticated user — NOT
 * admin-gated — since sources hang off an opportunity the caller is
 * tracking; see `docs/decisions.md`, "Catalog modules" /
 * `docs/api-reference.md`.
 */

/** Preview a public URL for capture — network I/O only, nothing persisted. Rate-limited at the route layer. */
export async function fetchSourcePreview(url: string): Promise<FetchedUrlPreview> {
  return fetchUrlPreview(url);
}

/**
 * `autoFetch: true` fetches `sourceUrl` server-side and fills
 * `sourceName`/`extractedContent` ONLY when those were left empty — it
 * never overwrites user-supplied text, and never creates an Opportunity.
 * `contentOrigin` is set to `fetched` only when the fetch actually filled
 * something; otherwise it stays `manual`.
 */
export async function createOpportunitySource(
  input: CreateOpportunitySourceInput,
): Promise<HydratedDocument<OpportunitySourceDoc>> {
  await getOpportunityOrThrow(input.opportunityId);

  const { autoFetch, capturedAt, publishedAt, ...fields } = input;
  let contentOrigin: ContentOrigin = ContentOrigin.MANUAL;
  let sourceName = fields.sourceName;
  let extractedContent = fields.extractedContent;

  if (autoFetch) {
    if (!fields.sourceUrl) {
      throw new BadRequestError('autoFetch requires a sourceUrl to fetch');
    }
    const preview = await fetchUrlPreview(fields.sourceUrl);
    let filled = false;
    if (!extractedContent?.trim()) {
      extractedContent = preview.extractedContent;
      filled = true;
    }
    if (!sourceName?.trim() && preview.title) {
      sourceName = preview.title;
      filled = true;
    }
    if (filled) {
      contentOrigin = ContentOrigin.FETCHED;
    }
  }

  return OpportunitySource.create({
    ...fields,
    sourceName: sourceName ?? null,
    extractedContent: extractedContent ?? null,
    contentOrigin,
    capturedAt: capturedAt ? new Date(capturedAt) : new Date(),
    publishedAt: publishedAt ? new Date(publishedAt) : null,
  });
}

/** Keyset-paginated, ordered by `(capturedAt, id)` DESC (newest first). */
export async function listOpportunitySources(
  query: ListOpportunitySourcesQuery,
): Promise<PaginatedResult<HydratedDocument<OpportunitySourceDoc>>> {
  const filter: FilterQuery<OpportunitySourceDoc> = {};
  if (query.opportunityId) {
    filter.opportunityId = query.opportunityId;
  }
  return paginate(OpportunitySource, {
    filter,
    sortField: 'capturedAt',
    sortOrder: query.order ?? 'desc',
    cursor: query.cursor ?? null,
    limit: query.limit ?? null,
  });
}

export async function getOpportunitySourceOrThrow(
  id: string,
): Promise<HydratedDocument<OpportunitySourceDoc>> {
  if (!isValidObjectId(id)) {
    throw new NotFoundError('Opportunity source not found');
  }
  const source = await OpportunitySource.findById(id);
  if (!source) {
    throw new NotFoundError('Opportunity source not found');
  }
  return source;
}

/** Re-validates a newly-supplied `opportunityId` — a source cannot be silently re-parented to a nonexistent opportunity. */
export async function updateOpportunitySource(
  id: string,
  input: UpdateOpportunitySourceInput,
): Promise<HydratedDocument<OpportunitySourceDoc>> {
  const source = await getOpportunitySourceOrThrow(id);
  if (input.opportunityId) {
    await getOpportunityOrThrow(input.opportunityId);
  }

  const { capturedAt, publishedAt, ...rest } = input;
  Object.assign(source, rest);
  if (capturedAt) {
    source.capturedAt = new Date(capturedAt);
  }
  if (publishedAt !== undefined) {
    source.publishedAt = publishedAt ? new Date(publishedAt) : null;
  }
  await source.save();
  return source;
}

export async function deleteOpportunitySource(id: string): Promise<void> {
  await getOpportunitySourceOrThrow(id);
  await OpportunitySource.deleteOne({ _id: id });
}
