import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { Opportunity } from '../../models/opportunity.model';
import { OpportunitySource } from '../../models/opportunity-source.model';
import { ContentOrigin, OpportunitySourceType } from '../../lib/enums';
import { BadRequestError, NotFoundError } from '../../lib/http-errors';
import type { FetchedUrlPreview } from '../../lib/url-fetch';

// `fetchUrlPreview` performs real network I/O (SSRF-hardened DNS lookups +
// `fetch()`) — mocked here so these tests never make a real HTTP request.
vi.mock('../../lib/url-fetch', () => ({
  fetchUrlPreview: vi.fn(),
}));

import { fetchUrlPreview } from '../../lib/url-fetch';
import {
  createOpportunitySource,
  deleteOpportunitySource,
  fetchSourcePreview,
  getOpportunitySourceOrThrow,
  listOpportunitySources,
  updateOpportunitySource,
} from '../opportunity-sources.service';

const mockedFetchUrlPreview = vi.mocked(fetchUrlPreview);

const ownerId = new Types.ObjectId().toString();
const otherOwnerId = new Types.ObjectId().toString();

function stubPreview(overrides: Partial<FetchedUrlPreview> = {}): FetchedUrlPreview {
  return {
    url: 'https://example.test/scholarship',
    finalUrl: 'https://example.test/scholarship',
    title: 'Fetched Title',
    extractedContent: 'Fetched body text',
    contentType: 'text/html',
    ...overrides,
  };
}

describe('opportunity-sources.service', () => {
  beforeEach(() => {
    mockedFetchUrlPreview.mockReset();
  });

  describe('fetchSourcePreview', () => {
    it('delegates to fetchUrlPreview without persisting anything', async () => {
      mockedFetchUrlPreview.mockResolvedValueOnce(stubPreview());
      const preview = await fetchSourcePreview('https://example.test/scholarship');
      expect(preview.title).toBe('Fetched Title');
      expect(await OpportunitySource.countDocuments()).toBe(0);
    });
  });

  describe('createOpportunitySource', () => {
    it('validates the opportunity exists before creating the source', async () => {
      await expect(
        createOpportunitySource(ownerId, { opportunityId: '507f1f77bcf86cd799439011' }),
      ).rejects.toThrow(NotFoundError);
      expect(await OpportunitySource.countDocuments()).toBe(0);
    });

    it('rejects an opportunity owned by someone else', async () => {
      const opportunity = await Opportunity.create({ ownerId: otherOwnerId, title: 'Theirs' });
      await expect(
        createOpportunitySource(ownerId, { opportunityId: String(opportunity._id) }),
      ).rejects.toThrow(NotFoundError);
    });

    it('defaults capturedAt to now and contentOrigin to manual when autoFetch is not set', async () => {
      const opportunity = await Opportunity.create({ ownerId, title: 'Fulbright Scholarship' });
      const before = Date.now();

      const source = await createOpportunitySource(ownerId, { opportunityId: String(opportunity._id) });

      expect(source.capturedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(source.contentOrigin).toBe(ContentOrigin.MANUAL);
      expect(String(source.ownerId)).toBe(ownerId);
      expect(mockedFetchUrlPreview).not.toHaveBeenCalled();
    });

    it('autoFetch fills empty fields and sets contentOrigin=fetched', async () => {
      const opportunity = await Opportunity.create({ ownerId, title: 'Fulbright Scholarship' });
      mockedFetchUrlPreview.mockResolvedValueOnce(stubPreview());

      const source = await createOpportunitySource(ownerId, {
        opportunityId: String(opportunity._id),
        sourceUrl: 'https://example.test/scholarship',
        autoFetch: true,
      });

      expect(mockedFetchUrlPreview).toHaveBeenCalledWith('https://example.test/scholarship');
      expect(source.sourceName).toBe('Fetched Title');
      expect(source.extractedContent).toBe('Fetched body text');
      expect(source.contentOrigin).toBe(ContentOrigin.FETCHED);
    });

    it('autoFetch never overwrites user-supplied content', async () => {
      const opportunity = await Opportunity.create({ ownerId, title: 'Fulbright Scholarship' });
      mockedFetchUrlPreview.mockResolvedValueOnce(stubPreview());

      const source = await createOpportunitySource(ownerId, {
        opportunityId: String(opportunity._id),
        sourceUrl: 'https://example.test/scholarship',
        sourceName: 'My title',
        extractedContent: 'My excerpt',
        autoFetch: true,
      });

      expect(source.sourceName).toBe('My title');
      expect(source.extractedContent).toBe('My excerpt');
      expect(source.contentOrigin).toBe(ContentOrigin.MANUAL);
    });

    it('rejects autoFetch without a sourceUrl', async () => {
      const opportunity = await Opportunity.create({ ownerId, title: 'Fulbright Scholarship' });
      await expect(
        createOpportunitySource(ownerId, { opportunityId: String(opportunity._id), autoFetch: true }),
      ).rejects.toThrow(BadRequestError);
      expect(mockedFetchUrlPreview).not.toHaveBeenCalled();
    });

    it('autoFetch never creates an Opportunity', async () => {
      const opportunity = await Opportunity.create({ ownerId, title: 'Fulbright Scholarship' });
      mockedFetchUrlPreview.mockResolvedValueOnce(stubPreview());
      await createOpportunitySource(ownerId, {
        opportunityId: String(opportunity._id),
        sourceUrl: 'https://example.test/scholarship',
        autoFetch: true,
      });
      expect(await Opportunity.countDocuments()).toBe(1);
    });
  });

  describe('listOpportunitySources', () => {
    it('only returns sources owned by the caller', async () => {
      const mine = await Opportunity.create({ ownerId, title: 'Mine' });
      const theirs = await Opportunity.create({ ownerId: otherOwnerId, title: 'Theirs' });
      await OpportunitySource.create({ ownerId, opportunityId: mine._id, capturedAt: new Date() });
      await OpportunitySource.create({ ownerId: otherOwnerId, opportunityId: theirs._id, capturedAt: new Date() });

      const result = await listOpportunitySources(ownerId, {});
      expect(result.items).toHaveLength(1);
      expect(String(result.items[0].opportunityId)).toBe(String(mine._id));
    });

    it('filters by opportunityId and orders newest-first', async () => {
      const oppA = await Opportunity.create({ ownerId, title: 'A' });
      const oppB = await Opportunity.create({ ownerId, title: 'B' });
      await OpportunitySource.create({
        ownerId,
        opportunityId: oppA._id,
        capturedAt: new Date('2026-01-01T00:00:00Z'),
        sourceType: OpportunitySourceType.MANUAL_ENTRY,
      });
      const newer = await OpportunitySource.create({
        ownerId,
        opportunityId: oppA._id,
        capturedAt: new Date('2026-02-01T00:00:00Z'),
        sourceType: OpportunitySourceType.MANUAL_ENTRY,
      });
      await OpportunitySource.create({ ownerId, opportunityId: oppB._id, capturedAt: new Date() });

      const result = await listOpportunitySources(ownerId, { opportunityId: String(oppA._id) });
      expect(result.items).toHaveLength(2);
      expect(String(result.items[0]._id)).toBe(String(newer._id));
    });
  });

  describe('getOpportunitySourceOrThrow', () => {
    it('throws NotFoundError for a source owned by someone else', async () => {
      const opportunity = await Opportunity.create({ ownerId: otherOwnerId, title: 'Theirs' });
      const source = await OpportunitySource.create({
        ownerId: otherOwnerId,
        opportunityId: opportunity._id,
        capturedAt: new Date(),
      });
      await expect(getOpportunitySourceOrThrow(String(source._id), ownerId)).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError for a missing id', async () => {
      await expect(getOpportunitySourceOrThrow('507f1f77bcf86cd799439011', ownerId)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('updateOpportunitySource — re-parenting validation', () => {
    it('validates a newly supplied opportunityId before applying the update', async () => {
      const opp = await Opportunity.create({ ownerId, title: 'A' });
      const source = await OpportunitySource.create({ ownerId, opportunityId: opp._id, capturedAt: new Date() });

      await expect(
        updateOpportunitySource(String(source._id), ownerId, { opportunityId: '507f1f77bcf86cd799439011' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects re-parenting to an opportunity owned by someone else', async () => {
      const opp = await Opportunity.create({ ownerId, title: 'A' });
      const theirs = await Opportunity.create({ ownerId: otherOwnerId, title: 'Theirs' });
      const source = await OpportunitySource.create({ ownerId, opportunityId: opp._id, capturedAt: new Date() });

      await expect(
        updateOpportunitySource(String(source._id), ownerId, { opportunityId: String(theirs._id) }),
      ).rejects.toThrow(NotFoundError);
    });

    it('re-parents to a valid, different opportunity owned by the caller', async () => {
      const oppA = await Opportunity.create({ ownerId, title: 'A' });
      const oppB = await Opportunity.create({ ownerId, title: 'B' });
      const source = await OpportunitySource.create({ ownerId, opportunityId: oppA._id, capturedAt: new Date() });

      const updated = await updateOpportunitySource(String(source._id), ownerId, { opportunityId: String(oppB._id) });
      expect(String(updated.opportunityId)).toBe(String(oppB._id));
    });

    it('does not re-validate opportunityId when the update does not touch it', async () => {
      const opp = await Opportunity.create({ ownerId, title: 'A' });
      const source = await OpportunitySource.create({ ownerId, opportunityId: opp._id, capturedAt: new Date() });

      const updated = await updateOpportunitySource(String(source._id), ownerId, { sourceName: 'Newsletter' });
      expect(updated.sourceName).toBe('Newsletter');
    });
  });

  describe('deleteOpportunitySource', () => {
    it('deletes an existing source owned by the caller', async () => {
      const opp = await Opportunity.create({ ownerId, title: 'A' });
      const source = await OpportunitySource.create({ ownerId, opportunityId: opp._id, capturedAt: new Date() });
      await deleteOpportunitySource(String(source._id), ownerId);
      expect(await OpportunitySource.findById(source._id)).toBeNull();
    });

    it('throws NotFoundError instead of deleting nothing when missing', async () => {
      await expect(deleteOpportunitySource('507f1f77bcf86cd799439011', ownerId)).rejects.toThrow(NotFoundError);
    });
  });
});
