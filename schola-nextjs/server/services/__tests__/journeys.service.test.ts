import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { University } from '../../models/university.model';
import { Programme } from '../../models/programme.model';
import { ApplicationJourney } from '../../models/application-journey.model';
import { JourneyStatus } from '../../lib/enums';
import { NotFoundError } from '../../lib/http-errors';
import { normalizeName } from '../../lib/normalize-name';
import {
  createJourney,
  deleteJourney,
  getJourneyOwnedOrThrow,
  listJourneysForUser,
  updateJourney,
} from '../journeys.service';

const userId = new Types.ObjectId().toString();
const otherUserId = new Types.ObjectId().toString();

describe('journeys.service', () => {
  describe('createJourney', () => {
    it('creates a journey owned by the given user', async () => {
      const journey = await createJourney(userId, { title: 'MSc Computer Science' });
      expect(journey.title).toBe('MSc Computer Science');
      expect(String(journey.userId)).toBe(userId);
      expect(journey.status).toBe(JourneyStatus.PLANNING);
    });

    it('rejects an unknown universityId', async () => {
      await expect(
        createJourney(userId, {
          title: 'MSc Computer Science',
          universityId: new Types.ObjectId().toString(),
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects an unknown programmeId', async () => {
      await expect(
        createJourney(userId, {
          title: 'MSc Computer Science',
          programmeId: new Types.ObjectId().toString(),
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('accepts a real university/programme pair owned by the caller', async () => {
      const university = await University.create({
        ownerId: userId,
        name: 'University of Twente',
        normalizedName: normalizeName('University of Twente'),
      });
      const programme = await Programme.create({
        ownerId: userId,
        universityId: university._id,
        name: 'MSc CS',
        normalizedName: normalizeName('MSc CS'),
      });

      const journey = await createJourney(userId, {
        title: 'MSc Computer Science',
        universityId: String(university._id),
        programmeId: String(programme._id),
      });
      expect(String(journey.universityId)).toBe(String(university._id));
      expect(String(journey.programmeId)).toBe(String(programme._id));
    });

    it('rejects a university owned by another user — cannot link to catalog identity you do not own', async () => {
      const university = await University.create({
        ownerId: otherUserId,
        name: 'University of Twente',
        normalizedName: normalizeName('University of Twente'),
      });
      await expect(
        createJourney(userId, { title: 'MSc Computer Science', universityId: String(university._id) }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('listJourneysForUser', () => {
    it('only returns journeys owned by the given user', async () => {
      await createJourney(userId, { title: 'Mine 1' });
      await createJourney(userId, { title: 'Mine 2' });
      await createJourney(otherUserId, { title: 'Not mine' });

      const page = await listJourneysForUser(userId, {});
      expect(page.items).toHaveLength(2);
      expect(page.items.every((j) => String(j.userId) === userId)).toBe(true);
    });

    it('paginates with a keyset cursor', async () => {
      for (let i = 0; i < 3; i++) {
        await createJourney(userId, { title: `Journey ${i}` });
      }
      const page1 = await listJourneysForUser(userId, { limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.hasNextPage).toBe(true);

      const page2 = await listJourneysForUser(userId, { limit: 2, cursor: page1.nextCursor ?? undefined });
      expect(page2.items).toHaveLength(1);
    });
  });

  describe('getJourneyOwnedOrThrow', () => {
    it('returns the journey for its owner', async () => {
      const journey = await createJourney(userId, { title: 'Mine' });
      const found = await getJourneyOwnedOrThrow(String(journey._id), userId);
      expect(String(found._id)).toBe(String(journey._id));
    });

    it('404s for another user (not 403) — existence is never disclosed', async () => {
      const journey = await createJourney(userId, { title: 'Mine' });
      await expect(getJourneyOwnedOrThrow(String(journey._id), otherUserId)).rejects.toThrow(NotFoundError);
    });

    it('404s for a nonexistent id', async () => {
      await expect(getJourneyOwnedOrThrow(new Types.ObjectId().toString(), userId)).rejects.toThrow(
        NotFoundError,
      );
    });

    it('404s for a syntactically invalid id instead of throwing a cast error', async () => {
      await expect(getJourneyOwnedOrThrow('not-an-id', userId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateJourney', () => {
    it('updates owned fields', async () => {
      const journey = await createJourney(userId, { title: 'Before' });
      const updated = await updateJourney(String(journey._id), userId, {
        title: 'After',
        status: JourneyStatus.ACTIVE,
      });
      expect(updated.title).toBe('After');
      expect(updated.status).toBe(JourneyStatus.ACTIVE);
    });

    it('rejects updating another user journey', async () => {
      const journey = await createJourney(userId, { title: 'Mine' });
      await expect(updateJourney(String(journey._id), otherUserId, { title: 'Hijacked' })).rejects.toThrow(
        NotFoundError,
      );
    });

    it('rejects an unknown universityId on update', async () => {
      const journey = await createJourney(userId, { title: 'Mine' });
      await expect(
        updateJourney(String(journey._id), userId, { universityId: new Types.ObjectId().toString() }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteJourney', () => {
    it('hard-deletes an owned journey', async () => {
      const journey = await createJourney(userId, { title: 'Mine' });
      await deleteJourney(String(journey._id), userId);
      expect(await ApplicationJourney.findById(journey._id)).toBeNull();
    });

    it('404s deleting another user journey, leaving it intact', async () => {
      const journey = await createJourney(userId, { title: 'Mine' });
      await expect(deleteJourney(String(journey._id), otherUserId)).rejects.toThrow(NotFoundError);
      expect(await ApplicationJourney.findById(journey._id)).not.toBeNull();
    });
  });
});
