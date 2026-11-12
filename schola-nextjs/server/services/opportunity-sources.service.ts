import type { FilterQuery, HydratedDocument } from 'mongoose';
import { OpportunitySource, type OpportunitySourceDoc } from '../models/opportunity-source.model';
import { ContentOrigin } from '../lib/enums';
import { BadRequestError, NotFoundError } from '../lib/http-errors';
import { fetchUrlPreview, type FetchedUrlPreview } from '../lib/url-fetch';
import { inferOpportunityFields, type OpportunityFieldSuggestions } from '../lib/opportunity-inference';
import { paginate, type PaginatedResult } from '../lib/pagination';
import { isValidObjectId } from '../validation/common';
import type {
  CreateOpportunitySourceInput,
  ListOpportunitySourcesQuery,
  UpdateOpportunitySourceInput,
} from '../validation/opportunity-sources';
import { getOpportunityOrThrow } from './opportunities.service';

/**
 * An OpportunitySource hangs off an Opportunity the caller owns — see
 * `opportunities.service.ts`'s doc comment. `ownerId` is denormalized onto
 * the source itself (see `opportunity-source.model.ts`) so list/get/update/
 * delete can be scoped directly without an extra lookup per row.
 */

/**
 * Preview a public URL for capture — network I/O only, nothing persisted.
 * Rate-limited at the route layer. Alongside the raw fetch, runs a
 * deterministic (non-AI) best-effort guess at opportunityType/studyLevel/
 * country from the fetched title/excerpt — see `opportunity-inference.ts`.
 * These are suggestions only: the frontend pre-fills them into the create
 * form exactly like title/summary already were, never persists them
 * directly, and the caller can freely overwrite any of them before saving.
 */
export async function fetchSourcePreview(url: string): Promise<FetchedUrlPreview & OpportunityFieldSuggestions> {
  const preview = await fetchUrlPreview(url);
  const suggestions = inferOpportunityFields({
    title: preview.title,
    text: preview.extractedContent,
    finalUrl: preview.finalUrl,
  });
  return { ...preview, ...suggestions };
}

/**
 * `autoFetch: true` fetches `sourceUrl` server-side and fills
 * `sourceName`/`extractedContent` ONLY when those were left empty — it
 * never overwrites user-supplied text, and never creates an Opportunity.
 * `contentOrigin` is set to `fetched` only when the fetch actually filled
 * something; otherwise it stays `manual`.
 */
export async function createOpportunitySource(
  ownerId: string,
  input: CreateOpportunitySourceInput,
): Promise<HydratedDocument<OpportunitySourceDoc>> {
  await getOpportunityOrThrow(input.opportunityId, ownerId);

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
    ownerId,
    sourceName: sourceName ?? null,
    extractedContent: extractedContent ?? null,
    contentOrigin,
    capturedAt: capturedAt ? new Date(capturedAt) : new Date(),
    publishedAt: publishedAt ? new Date(publishedAt) : null,
  });
}

/** Keyset-paginated, ordered by `(capturedAt, id)` DESC (newest first). Always scoped to the caller's own sources. */
export async function listOpportunitySources(
  ownerId: string,
  query: ListOpportunitySourcesQuery,
): Promise<PaginatedResult<HydratedDocument<OpportunitySourceDoc>>> {
  const filter: FilterQuery<OpportunitySourceDoc> = { ownerId };
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
  ownerId: string,
): Promise<HydratedDocument<OpportunitySourceDoc>> {
  if (!isValidObjectId(id)) {
    throw new NotFoundError('Opportunity source not found');
  }
  const source = await OpportunitySource.findOne({ _id: id, ownerId });
  if (!source) {
    throw new NotFoundError('Opportunity source not found');
  }
  return source;
}

/** Re-validates a newly-supplied `opportunityId` — a source cannot be silently re-parented to an opportunity the caller doesn't own. */
export async function updateOpportunitySource(
  id: string,
  ownerId: string,
  input: UpdateOpportunitySourceInput,
): Promise<HydratedDocument<OpportunitySourceDoc>> {
  const source = await getOpportunitySourceOrThrow(id, ownerId);
  if (input.opportunityId) {
    await getOpportunityOrThrow(input.opportunityId, ownerId);
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

export async function deleteOpportunitySource(id: string, ownerId: string): Promise<void> {
  await getOpportunitySourceOrThrow(id, ownerId);
  await OpportunitySource.deleteOne({ _id: id, ownerId });
}
