import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { University } from '../../models/university.model';
import { Programme } from '../../models/programme.model';
import { Opportunity } from '../../models/opportunity.model';
import { OpportunitySource } from '../../models/opportunity-source.model';
import { Requirement } from '../../models/requirement.model';
import { Deadline } from '../../models/deadline.model';
import { OpportunityType, RequirementType, StudyLevel } from '../../lib/enums';
import { BadRequestError, NotFoundError } from '../../lib/http-errors';
import { normalizeName } from '../../lib/normalize-name';
import {
  createOpportunity,
  deleteOpportunity,
  getOpportunityOrThrow,
  getOpportunityWithDetailsOrThrow,
  listOpportunities,
  updateOpportunity,
} from '../opportunities.service';

const ownerId = new Types.ObjectId().toString();
const otherOwnerId = new Types.ObjectId().toString();

describe('opportunities.service', () => {
  describe('createOpportunity', () => {
    it('creates an opportunity owned by the caller, with no university/programme set', async () => {
      const opportunity = await createOpportunity(ownerId, { title: 'Fulbright Scholarship' });
      expect(opportunity.title).toBe('Fulbright Scholarship');
      expect(opportunity.opportunityType).toBe(OpportunityType.SCHOLARSHIP);
      expect(String(opportunity.ownerId)).toBe(ownerId);
    });

    it('rejects an unknown universityId', async () => {
      await expect(
        createOpportunity(ownerId, { title: 'Fulbright Scholarship', universityId: '507f1f77bcf86cd799439011' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects a universityId owned by someone else', async () => {
      const uni = await University.create({ ownerId: otherOwnerId, name: 'University A', normalizedName: normalizeName('University A') });
      await expect(
        createOpportunity(ownerId, { title: 'Fulbright Scholarship', universityId: String(uni._id) }),
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects a programmeId that does not belong to the given universityId', async () => {
      const uniA = await University.create({ ownerId, name: 'University A', normalizedName: normalizeName('University A') });
      const uniB = await University.create({ ownerId, name: 'University B', normalizedName: normalizeName('University B') });
      const programmeAtB = await Programme.create({ ownerId, universityId: uniB._id, name: 'MSc AI', normalizedName: normalizeName('MSc AI') });

      await expect(
        createOpportunity(ownerId, {
          title: 'Fulbright Scholarship',
          universityId: String(uniA._id),
          programmeId: String(programmeAtB._id),
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it('accepts a programmeId that does belong to the given universityId', async () => {
      const uni = await University.create({ ownerId, name: 'University A', normalizedName: normalizeName('University A') });
      const programme = await Programme.create({ ownerId, universityId: uni._id, name: 'MSc AI', normalizedName: normalizeName('MSc AI') });

      const opportunity = await createOpportunity(ownerId, {
        title: 'Fulbright Scholarship',
        universityId: String(uni._id),
        programmeId: String(programme._id),
      });
      expect(String(opportunity.programmeId)).toBe(String(programme._id));
    });
  });

  describe('listOpportunities', () => {
    it('only returns opportunities owned by the caller', async () => {
      await Opportunity.create({ ownerId, title: 'Mine' });
      await Opportunity.create({ ownerId: otherOwnerId, title: 'Not mine' });

      const result = await listOpportunities(ownerId, {});
      expect(result.items.map((o) => o.title)).toEqual(['Mine']);
    });

    it('filters by studyLevel, country, opportunityType, universityId, and programmeId', async () => {
      const uni = await University.create({ ownerId, name: 'University A', normalizedName: normalizeName('University A') });
      const programme = await Programme.create({ ownerId, universityId: uni._id, name: 'MSc AI', normalizedName: normalizeName('MSc AI') });

      const match = await Opportunity.create({
        ownerId,
        title: 'Matching opportunity',
        studyLevel: StudyLevel.MASTERS,
        country: 'Netherlands',
        opportunityType: OpportunityType.GRANT,
        universityId: uni._id,
        programmeId: programme._id,
      });
      await Opportunity.create({ ownerId, title: 'Non-matching opportunity', studyLevel: StudyLevel.PHD });

      const result = await listOpportunities(ownerId, {
        studyLevel: StudyLevel.MASTERS,
        country: 'Netherlands',
        opportunityType: OpportunityType.GRANT,
        universityId: String(uni._id),
        programmeId: String(programme._id),
      });

      expect(result.items).toHaveLength(1);
      expect(String(result.items[0]._id)).toBe(String(match._id));
    });

    it('orders newest-first by default', async () => {
      const older = await Opportunity.create({ ownerId, title: 'Older' });
      await new Promise((resolve) => setTimeout(resolve, 5));
      const newer = await Opportunity.create({ ownerId, title: 'Newer' });

      const result = await listOpportunities(ownerId, {});
      expect(result.items.map((o) => String(o._id))).toEqual([String(newer._id), String(older._id)]);
    });

    it('ids filter resolves exactly the requested opportunities in one call (the dashboard bulk-lookup use case)', async () => {
      const a = await Opportunity.create({ ownerId, title: 'A' });
      const b = await Opportunity.create({ ownerId, title: 'B' });
      await Opportunity.create({ ownerId, title: 'Not requested' });

      const result = await listOpportunities(ownerId, { ids: `${String(a._id)},${String(b._id)}` });

      expect(result.items.map((o) => String(o._id)).sort()).toEqual([String(a._id), String(b._id)].sort());
    });

    it('ids filter never returns another owner\'s opportunity even if its id is requested', async () => {
      const mine = await Opportunity.create({ ownerId, title: 'Mine' });
      const theirs = await Opportunity.create({ ownerId: otherOwnerId, title: 'Theirs' });

      const result = await listOpportunities(ownerId, { ids: `${String(mine._id)},${String(theirs._id)}` });

      expect(result.items.map((o) => String(o._id))).toEqual([String(mine._id)]);
    });

    it('ids filter silently drops a malformed id rather than erroring', async () => {
      const a = await Opportunity.create({ ownerId, title: 'A' });

      const result = await listOpportunities(ownerId, { ids: `${String(a._id)},not-a-real-id` });

      expect(result.items).toHaveLength(1);
      expect(String(result.items[0]._id)).toBe(String(a._id));
    });
  });

  describe('getOpportunityOrThrow', () => {
    it('throws NotFoundError for an opportunity owned by someone else', async () => {
      const opportunity = await Opportunity.create({ ownerId: otherOwnerId, title: 'Theirs' });
      await expect(getOpportunityOrThrow(String(opportunity._id), ownerId)).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError for a missing id', async () => {
      await expect(getOpportunityOrThrow('507f1f77bcf86cd799439011', ownerId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('getOpportunityWithDetailsOrThrow', () => {
    it('includes sources, requirements, and deadlines', async () => {
      const opportunity = await Opportunity.create({ ownerId, title: 'Fulbright Scholarship' });
      await OpportunitySource.create({ ownerId, opportunityId: opportunity._id, capturedAt: new Date() });
      await Requirement.create({
        opportunityId: opportunity._id,
        requirementType: RequirementType.ACADEMIC,
        description: 'Bachelor degree required',
      });
      await Deadline.create({ opportunityId: opportunity._id, label: 'Application deadline', date: new Date() });

      const details = await getOpportunityWithDetailsOrThrow(String(opportunity._id), ownerId);
      expect(details.sources).toHaveLength(1);
      expect(details.requirements).toHaveLength(1);
      expect(details.deadlines).toHaveLength(1);
    });

    it('throws NotFoundError for an opportunity owned by someone else', async () => {
      const opportunity = await Opportunity.create({ ownerId: otherOwnerId, title: 'Theirs' });
      await expect(getOpportunityWithDetailsOrThrow(String(opportunity._id), ownerId)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('updateOpportunity', () => {
    it('re-validates relationships using the effective (merged) university/programme', async () => {
      const uni = await University.create({ ownerId, name: 'University A', normalizedName: normalizeName('University A') });
      const otherUni = await University.create({ ownerId, name: 'University B', normalizedName: normalizeName('University B') });
      const programme = await Programme.create({ ownerId, universityId: uni._id, name: 'MSc AI', normalizedName: normalizeName('MSc AI') });
      const opportunity = await Opportunity.create({
        ownerId,
        title: 'Fulbright Scholarship',
        universityId: uni._id,
        programmeId: programme._id,
      });

      // Changing only universityId while programmeId (still at `uni`) is left untouched
      // must be rejected, since the programme would no longer belong to the new university.
      await expect(
        updateOpportunity(String(opportunity._id), ownerId, { universityId: String(otherUni._id) }),
      ).rejects.toThrow(BadRequestError);
    });

    it('applies a valid partial update', async () => {
      const opportunity = await Opportunity.create({ ownerId, title: 'Fulbright Scholarship' });
      const updated = await updateOpportunity(String(opportunity._id), ownerId, { title: 'Updated title' });
      expect(updated.title).toBe('Updated title');
    });

    it('throws NotFoundError instead of updating an opportunity owned by someone else', async () => {
      const opportunity = await Opportunity.create({ ownerId: otherOwnerId, title: 'Theirs' });
      await expect(
        updateOpportunity(String(opportunity._id), ownerId, { title: 'Hijacked' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError instead of creating a row when missing', async () => {
      await expect(
        updateOpportunity('507f1f77bcf86cd799439011', ownerId, { title: 'Updated title' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteOpportunity', () => {
    it('deletes an existing opportunity owned by the caller', async () => {
      const opportunity = await Opportunity.create({ ownerId, title: 'Fulbright Scholarship' });
      await deleteOpportunity(String(opportunity._id), ownerId);
      expect(await Opportunity.findById(opportunity._id)).toBeNull();
    });

    it('throws NotFoundError instead of deleting an opportunity owned by someone else', async () => {
      const opportunity = await Opportunity.create({ ownerId: otherOwnerId, title: 'Theirs' });
      await expect(deleteOpportunity(String(opportunity._id), ownerId)).rejects.toThrow(NotFoundError);
      expect(await Opportunity.findById(opportunity._id)).not.toBeNull();
    });

    it('throws NotFoundError instead of deleting nothing when missing', async () => {
      await expect(deleteOpportunity('507f1f77bcf86cd799439011', ownerId)).rejects.toThrow(NotFoundError);
    });
  });
});
