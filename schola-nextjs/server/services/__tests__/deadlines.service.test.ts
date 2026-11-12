import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { Opportunity } from '../../models/opportunity.model';
import { RequirementType } from '../../lib/enums';
import { BadRequestError, NotFoundError } from '../../lib/http-errors';
import { createJourney } from '../journeys.service';
import { createApplication } from '../applications.service';
import { createTask } from '../tasks.service';
import { createRequirement } from '../requirements.service';
import { createDeadline, findDeadlineAccessible, listDeadlines, updateDeadline } from '../deadlines.service';

const userId = new Types.ObjectId().toString();
const otherUserId = new Types.ObjectId().toString();

async function makeJourney(ownerId = userId) {
  return createJourney(ownerId, { title: 'MSc Computer Science' });
}

async function makeApplication(journeyId: string, ownerId = userId) {
  return createApplication(ownerId, { journeyId, title: 'App' });
}

describe('deadlines.service', () => {
  describe('"at least one of the four FK fields" validation', () => {
    it('createDeadline with none of opportunityId/applicationId/taskId/requirementId surfaces as a clean BadRequestError', async () => {
      await expect(
        createDeadline(userId, { label: 'Deadline with nothing attached', date: new Date().toISOString() }),
      ).rejects.toThrow(BadRequestError);
    });

    it('listDeadlines with no filters falls back to "all of the caller\'s own" rather than erroring', async () => {
      const result = await listDeadlines(userId, {}, {});
      expect(result.items).toEqual([]);
    });

    it('creates fine when exactly one FK field (opportunityId) is given', async () => {
      const opportunity = await Opportunity.create({ ownerId: userId, title: 'Fulbright' });
      const deadline = await createDeadline(userId, {
        label: 'Application opens',
        date: new Date().toISOString(),
        opportunityId: String(opportunity._id),
      });
      expect(String(deadline.opportunityId)).toBe(String(opportunity._id));
    });
  });

  describe('link ownership', () => {
    it('404s creating a deadline against an application owned by another user', async () => {
      const journey = await makeJourney(otherUserId);
      const application = await makeApplication(String(journey._id), otherUserId);
      await expect(
        createDeadline(userId, {
          label: 'Not mine',
          date: new Date().toISOString(),
          applicationId: String(application._id),
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('accepts a deadline linked via a taskId the caller owns', async () => {
      const journey = await makeJourney();
      const task = await createTask(userId, { journeyId: String(journey._id), title: 'Submit' });
      const deadline = await createDeadline(userId, {
        label: 'Submit by',
        date: new Date().toISOString(),
        taskId: String(task._id),
      });
      expect(String(deadline.taskId)).toBe(String(task._id));
    });

    it('accepts a deadline linked via a requirementId the caller owns', async () => {
      const journey = await makeJourney();
      const application = await makeApplication(String(journey._id));
      const requirement = await createRequirement(userId, {
        requirementType: RequirementType.OTHER,
        description: 'Upload transcript',
        applicationId: String(application._id),
      });
      const deadline = await createDeadline(userId, {
        label: 'Transcript due',
        date: new Date().toISOString(),
        requirementId: String(requirement._id),
      });
      expect(String(deadline.requirementId)).toBe(String(requirement._id));
    });
  });

  describe('get/update/list', () => {
    it('round-trips through findDeadlineAccessible and updateDeadline', async () => {
      const opportunity = await Opportunity.create({ ownerId: userId, title: 'Fulbright' });
      const deadline = await createDeadline(userId, {
        label: 'Application opens',
        date: new Date('2026-01-01').toISOString(),
        opportunityId: String(opportunity._id),
      });

      const fetched = await findDeadlineAccessible(String(deadline._id), userId);
      expect(fetched.label).toBe('Application opens');

      const updated = await updateDeadline(String(deadline._id), userId, { label: 'Opens soon' });
      expect(updated.label).toBe('Opens soon');
    });

    it('lists deadlines filtered by opportunityId', async () => {
      const opportunity = await Opportunity.create({ ownerId: userId, title: 'Fulbright' });
      const otherOpportunity = await Opportunity.create({ ownerId: userId, title: 'Other' });
      await createDeadline(userId, {
        label: 'A',
        date: new Date().toISOString(),
        opportunityId: String(opportunity._id),
      });
      await createDeadline(userId, {
        label: 'B',
        date: new Date().toISOString(),
        opportunityId: String(otherOpportunity._id),
      });

      const page = await listDeadlines(userId, { opportunityId: String(opportunity._id) }, {});
      expect(page.items).toHaveLength(1);
      expect(page.items[0].label).toBe('A');
    });
  });

  describe('listDeadlines "all mine" fallback (no filters given)', () => {
    it('returns deadlines reachable via an application, a task, or a requirement the caller owns', async () => {
      const journey = await makeJourney();
      const application = await makeApplication(String(journey._id));
      const task = await createTask(userId, { journeyId: String(journey._id), title: 'Submit' });
      const requirement = await createRequirement(userId, {
        requirementType: RequirementType.OTHER,
        description: 'Upload transcript',
        applicationId: String(application._id),
      });

      await createDeadline(userId, { label: 'App deadline', date: new Date().toISOString(), applicationId: String(application._id) });
      await createDeadline(userId, { label: 'Task deadline', date: new Date().toISOString(), taskId: String(task._id) });
      await createDeadline(userId, { label: 'Requirement deadline', date: new Date().toISOString(), requirementId: String(requirement._id) });

      const result = await listDeadlines(userId, {}, {});
      const labels = result.items.map((d) => d.label).sort();
      expect(labels).toEqual(['App deadline', 'Requirement deadline', 'Task deadline']);
    });

    it('never returns another user\'s deadlines', async () => {
      const journey = await makeJourney(otherUserId);
      const application = await makeApplication(String(journey._id), otherUserId);
      await createDeadline(otherUserId, {
        label: 'Not mine',
        date: new Date().toISOString(),
        applicationId: String(application._id),
      });

      const result = await listDeadlines(userId, {}, {});
      expect(result.items).toEqual([]);
    });

    it('excludes a deadline whose application has since been soft-deleted', async () => {
      const journey = await makeJourney();
      const application = await makeApplication(String(journey._id));
      await createDeadline(userId, {
        label: 'Will be orphaned',
        date: new Date().toISOString(),
        applicationId: String(application._id),
      });
      application.deletedAt = new Date();
      await application.save();

      const result = await listDeadlines(userId, {}, {});
      expect(result.items).toEqual([]);
    });

    it('includes an opportunity-scoped deadline for an opportunity the caller owns', async () => {
      const opportunity = await Opportunity.create({ ownerId: userId, title: 'Fulbright' });
      await createDeadline(userId, {
        label: 'Opportunity-only',
        date: new Date().toISOString(),
        opportunityId: String(opportunity._id),
      });

      const result = await listDeadlines(userId, {}, {});
      expect(result.items.map((d) => d.label)).toEqual(['Opportunity-only']);
    });

    it('excludes an opportunity-scoped deadline belonging to another user\'s opportunity', async () => {
      const otherOpportunity = await Opportunity.create({ ownerId: otherUserId, title: 'Theirs' });
      await createDeadline(otherUserId, {
        label: 'Not mine',
        date: new Date().toISOString(),
        opportunityId: String(otherOpportunity._id),
      });

      const result = await listDeadlines(userId, {}, {});
      expect(result.items).toEqual([]);
    });
  });

  describe('opportunity link ownership', () => {
    it('404s creating a deadline against an opportunity owned by another user', async () => {
      const opportunity = await Opportunity.create({ ownerId: otherUserId, title: 'Theirs' });
      await expect(
        createDeadline(userId, {
          label: 'Not mine',
          date: new Date().toISOString(),
          opportunityId: String(opportunity._id),
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('404s fetching a deadline whose opportunity is owned by another user', async () => {
      const opportunity = await Opportunity.create({ ownerId: userId, title: 'Fulbright' });
      const deadline = await createDeadline(userId, {
        label: 'Opportunity-only',
        date: new Date().toISOString(),
        opportunityId: String(opportunity._id),
      });

      await expect(findDeadlineAccessible(String(deadline._id), otherUserId)).rejects.toThrow(NotFoundError);
    });
  });
});
