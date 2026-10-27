import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { Opportunity } from '../../models/opportunity.model';
import { ApplicantProfile } from '../../models/applicant-profile.model';
import { RequirementStatus, RequirementSuggestionSource, RequirementType } from '../../lib/enums';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/http-errors';
import { createJourney } from '../journeys.service';
import { createApplication } from '../applications.service';
import {
  createRequirement,
  findRequirementAccessible,
  listRequirements,
} from '../requirements.service';
import {
  confirmRequirementSuggestion,
  rejectRequirementSuggestion,
  suggestRequirementStatus,
} from '../requirement-ai.service';

const userId = new Types.ObjectId().toString();
const otherUserId = new Types.ObjectId().toString();

async function makeJourney(ownerId = userId) {
  return createJourney(ownerId, { title: 'MSc Computer Science' });
}

async function makeApplication(ownerId = userId) {
  const journey = await makeJourney(ownerId);
  return createApplication(ownerId, { journeyId: String(journey._id), title: 'App' });
}

async function makeProfile(ownerId = userId) {
  return ApplicantProfile.create({ userId: ownerId });
}

describe('requirements.service', () => {
  describe('"at least one of opportunityId/applicationId" validation', () => {
    it('createRequirement with neither field surfaces as a clean BadRequestError', async () => {
      await expect(
        createRequirement(userId, { requirementType: RequirementType.GPA, description: 'GPA >= 3.5' }),
      ).rejects.toThrow(BadRequestError);
    });

    it('listRequirements with no filters surfaces as a clean BadRequestError', async () => {
      await expect(listRequirements(userId, {}, {})).rejects.toThrow(BadRequestError);
    });

    it('creates fine when only opportunityId is given (shared catalog data)', async () => {
      const opportunity = await Opportunity.create({ title: 'Fulbright' });
      const requirement = await createRequirement(userId, {
        requirementType: RequirementType.GPA,
        description: 'GPA >= 3.5',
        opportunityId: String(opportunity._id),
      });
      expect(String(requirement.opportunityId)).toBe(String(opportunity._id));
    });

    it('404s linking to an application owned by another user', async () => {
      const application = await makeApplication(otherUserId);
      await expect(
        createRequirement(userId, {
          requirementType: RequirementType.GPA,
          description: 'GPA >= 3.5',
          applicationId: String(application._id),
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('AI-suggestion lifecycle', () => {
    it('request -> persists suggested* fields without touching status', async () => {
      await makeProfile();
      const application = await makeApplication();
      const requirement = await createRequirement(userId, {
        requirementType: RequirementType.LANGUAGE,
        description: 'IELTS 6.5+',
        applicationId: String(application._id),
      });
      expect(requirement.status).toBe(RequirementStatus.UNKNOWN);

      const suggested = await suggestRequirementStatus(userId, String(requirement._id));
      expect(suggested.status).toBe(RequirementStatus.UNKNOWN);
      expect(suggested.suggestedStatus).not.toBeNull();
      expect(suggested.suggestedAt).not.toBeNull();
      expect(suggested.suggestionRationale).toBeTruthy();
      expect(suggested.suggestionSource).toBe(RequirementSuggestionSource.HEURISTIC);
    });

    it('confirm copies the suggestion into status and clears suggestion fields', async () => {
      await makeProfile();
      const application = await makeApplication();
      const requirement = await createRequirement(userId, {
        requirementType: RequirementType.LANGUAGE,
        description: 'IELTS 6.5+',
        applicationId: String(application._id),
      });
      const suggested = await suggestRequirementStatus(userId, String(requirement._id));
      const expectedStatus = suggested.suggestedStatus;

      const confirmed = await confirmRequirementSuggestion(userId, String(requirement._id));
      expect(confirmed.status).toBe(expectedStatus);
      expect(confirmed.suggestedStatus).toBeNull();
      expect(confirmed.suggestedAt).toBeNull();
      expect(confirmed.suggestionRationale).toBeNull();
      expect(confirmed.suggestionSource).toBeNull();
    });

    it('reject just clears the suggestion fields, leaving status unchanged', async () => {
      await makeProfile();
      const application = await makeApplication();
      const requirement = await createRequirement(userId, {
        requirementType: RequirementType.LANGUAGE,
        description: 'IELTS 6.5+',
        applicationId: String(application._id),
      });
      await suggestRequirementStatus(userId, String(requirement._id));

      const rejected = await rejectRequirementSuggestion(userId, String(requirement._id));
      expect(rejected.status).toBe(RequirementStatus.UNKNOWN);
      expect(rejected.suggestedStatus).toBeNull();
      expect(rejected.suggestedAt).toBeNull();
      expect(rejected.suggestionRationale).toBeNull();
      expect(rejected.suggestionSource).toBeNull();
    });

    it('confirm with no pending suggestion is a clean Conflict', async () => {
      await makeProfile();
      const application = await makeApplication();
      const requirement = await createRequirement(userId, {
        requirementType: RequirementType.LANGUAGE,
        description: 'IELTS 6.5+',
        applicationId: String(application._id),
      });
      await expect(confirmRequirementSuggestion(userId, String(requirement._id))).rejects.toThrow(
        ConflictError,
      );
    });

    it('reject with no pending suggestion is a clean Conflict', async () => {
      await makeProfile();
      const application = await makeApplication();
      const requirement = await createRequirement(userId, {
        requirementType: RequirementType.LANGUAGE,
        description: 'IELTS 6.5+',
        applicationId: String(application._id),
      });
      await expect(rejectRequirementSuggestion(userId, String(requirement._id))).rejects.toThrow(
        ConflictError,
      );
    });

    it('rejects suggesting for an opportunity-only (non-application) requirement', async () => {
      const opportunity = await Opportunity.create({ title: 'Fulbright' });
      const requirement = await createRequirement(userId, {
        requirementType: RequirementType.LANGUAGE,
        description: 'IELTS 6.5+',
        opportunityId: String(opportunity._id),
      });
      await expect(suggestRequirementStatus(userId, String(requirement._id))).rejects.toThrow(
        BadRequestError,
      );
    });
  });

  describe('ownership', () => {
    it('404s fetching a requirement attached to another user\'s application', async () => {
      const application = await makeApplication(otherUserId);
      const requirement = await createRequirement(otherUserId, {
        requirementType: RequirementType.GPA,
        description: 'GPA >= 3.5',
        applicationId: String(application._id),
      });
      await expect(findRequirementAccessible(String(requirement._id), userId)).rejects.toThrow(
        NotFoundError,
      );
    });
  });
});
