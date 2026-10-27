import { beforeEach, describe, expect, it, vi } from 'vitest';
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
        createOpportunitySource({ opportunityId: '507f1f77bcf86cd799439011' }),
      ).rejects.toThrow(NotFoundError);
      expect(await OpportunitySource.countDocuments()).toBe(0);
    });

    it('defaults capturedAt to now and contentOrigin to manual when autoFetch is not set', async () => {
      const opportunity = await Opportunity.create({ title: 'Fulbright Scholarship' });
      const before = Date.now();

      const source = await createOpportunitySource({ opportunityId: String(opportunity._id) });

      expect(source.capturedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(source.contentOrigin).toBe(ContentOrigin.MANUAL);
      expect(mockedFetchUrlPreview).not.toHaveBeenCalled();
    });

    it('autoFetch fills empty fields and sets contentOrigin=fetched', async () => {
      const opportunity = await Opportunity.create({ title: 'Fulbright Scholarship' });
      mockedFetchUrlPreview.mockResolvedValueOnce(stubPreview());

      const source = await createOpportunitySource({
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
      const opportunity = await Opportunity.create({ title: 'Fulbright Scholarship' });
      mockedFetchUrlPreview.mockResolvedValueOnce(stubPreview());

      const source = await createOpportunitySource({
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
      const opportunity = await Opportunity.create({ title: 'Fulbright Scholarship' });
      await expect(
        createOpportunitySource({ opportunityId: String(opportunity._id), autoFetch: true }),
      ).rejects.toThrow(BadRequestError);
      expect(mockedFetchUrlPreview).not.toHaveBeenCalled();
    });

    it('autoFetch never creates an Opportunity', async () => {
      const opportunity = await Opportunity.create({ title: 'Fulbright Scholarship' });
      mockedFetchUrlPreview.mockResolvedValueOnce(stubPreview());
      await createOpportunitySource({
        opportunityId: String(opportunity._id),
        sourceUrl: 'https://example.test/scholarship',
        autoFetch: true,
      });
      expect(await Opportunity.countDocuments()).toBe(1);
    });
  });

  describe('listOpportunitySources', () => {
    it('filters by opportunityId and orders newest-first', async () => {
      const oppA = await Opportunity.create({ title: 'A' });
      const oppB = await Opportunity.create({ title: 'B' });
      await OpportunitySource.create({
        opportunityId: oppA._id,
        capturedAt: new Date('2026-01-01T00:00:00Z'),
        sourceType: OpportunitySourceType.MANUAL_ENTRY,
      });
      const newer = await OpportunitySource.create({
        opportunityId: oppA._id,
        capturedAt: new Date('2026-02-01T00:00:00Z'),
        sourceType: OpportunitySourceType.MANUAL_ENTRY,
      });
      await OpportunitySource.create({ opportunityId: oppB._id, capturedAt: new Date() });

      const result = await listOpportunitySources({ opportunityId: String(oppA._id) });
      expect(result.items).toHaveLength(2);
      expect(String(result.items[0]._id)).toBe(String(newer._id));
    });
  });

  describe('getOpportunitySourceOrThrow', () => {
    it('throws NotFoundError for a missing id', async () => {
      await expect(getOpportunitySourceOrThrow('507f1f77bcf86cd799439011')).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateOpportunitySource — re-parenting validation', () => {
    it('validates a newly supplied opportunityId before applying the update', async () => {
      const opp = await Opportunity.create({ title: 'A' });
      const source = await OpportunitySource.create({ opportunityId: opp._id, capturedAt: new Date() });

      await expect(
        updateOpportunitySource(String(source._id), { opportunityId: '507f1f77bcf86cd799439011' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('re-parents to a valid, different opportunity', async () => {
      const oppA = await Opportunity.create({ title: 'A' });
      const oppB = await Opportunity.create({ title: 'B' });
      const source = await OpportunitySource.create({ opportunityId: oppA._id, capturedAt: new Date() });

      const updated = await updateOpportunitySource(String(source._id), { opportunityId: String(oppB._id) });
      expect(String(updated.opportunityId)).toBe(String(oppB._id));
    });

    it('does not re-validate opportunityId when the update does not touch it', async () => {
      const opp = await Opportunity.create({ title: 'A' });
      const source = await OpportunitySource.create({ opportunityId: opp._id, capturedAt: new Date() });

      const updated = await updateOpportunitySource(String(source._id), { sourceName: 'Newsletter' });
      expect(updated.sourceName).toBe('Newsletter');
    });
  });

  describe('deleteOpportunitySource', () => {
    it('deletes an existing source', async () => {
      const opp = await Opportunity.create({ title: 'A' });
      const source = await OpportunitySource.create({ opportunityId: opp._id, capturedAt: new Date() });
      await deleteOpportunitySource(String(source._id));
      expect(await OpportunitySource.findById(source._id)).toBeNull();
    });

    it('throws NotFoundError instead of deleting nothing when missing', async () => {
      await expect(deleteOpportunitySource('507f1f77bcf86cd799439011')).rejects.toThrow(NotFoundError);
    });
  });
});
