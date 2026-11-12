import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { University } from '../../models/university.model';
import { NotFoundError } from '../../lib/http-errors';
import {
  createUniversity,
  deleteUniversity,
  getUniversityOrThrow,
  listUniversities,
  updateUniversity,
} from '../universities.service';
import type { CreateUniversityInput } from '../../validation/universities';

const ownerId = new Types.ObjectId().toString();
const otherOwnerId = new Types.ObjectId().toString();

/** Convenience for tests that only care about the resulting document, not the dedup metadata. */
async function makeUniversity(owner: string, input: CreateUniversityInput) {
  const { university } = await createUniversity(owner, input);
  return university;
}

describe('universities.service', () => {
  describe('createUniversity', () => {
    it('creates and persists a university owned by the caller', async () => {
      const { university, wasCreated, conflictingFields } = await createUniversity(ownerId, {
        name: 'University of Twente',
        country: 'Netherlands',
      });
      expect(university.name).toBe('University of Twente');
      expect(String(university.ownerId)).toBe(ownerId);
      expect(university.normalizedName).toBe('university of twente');
      expect(wasCreated).toBe(true);
      expect(conflictingFields).toEqual([]);

      const reloaded = await University.findById(university._id);
      expect(reloaded?.country).toBe('Netherlands');
    });

    describe('normalization', () => {
      const cases: Array<[string, string, boolean]> = [
        ['University of Twente', 'university of twente', true], // case
        ['University of Twente', '  University of Twente  ', true], // leading/trailing whitespace
        ['University of Twente', 'University   of   Twente', true], // repeated internal whitespace
        ['University of Twente', 'University of Twente.', false], // trailing punctuation — must NOT merge
        ['University of Twente', 'Univ. of Twente', false], // abbreviation — must NOT merge
      ];

      for (const [first, second, shouldMerge] of cases) {
        it(`"${first}" then "${second}" ${shouldMerge ? 'reuse the same row' : 'stay separate'}`, async () => {
          const owner = new Types.ObjectId().toString();
          const a = await createUniversity(owner, { name: first });
          const b = await createUniversity(owner, { name: second });
          if (shouldMerge) {
            expect(String(b.university._id)).toBe(String(a.university._id));
            expect(b.wasCreated).toBe(false);
          } else {
            expect(String(b.university._id)).not.toBe(String(a.university._id));
            expect(b.wasCreated).toBe(true);
          }
          expect(await University.countDocuments({ ownerId: owner })).toBe(shouldMerge ? 1 : 2);
        });
      }
    });

    it('reuses an existing row with the same normalized name for this owner, rather than duplicating it', async () => {
      const first = await createUniversity(ownerId, { name: 'University of Twente' });
      const second = await createUniversity(ownerId, { name: 'university of twente' });

      expect(String(second.university._id)).toBe(String(first.university._id));
      expect(second.wasCreated).toBe(false);
      expect(await University.countDocuments({ ownerId })).toBe(1);
    });

    it('does not dedupe across different owners — each user may have their own row with the same name', async () => {
      await createUniversity(ownerId, { name: 'University of Twente' });
      await createUniversity(otherOwnerId, { name: 'University of Twente' });
      expect(await University.countDocuments()).toBe(2);
    });

    it('never overwrites the existing record\'s stored fields when a second submission differs', async () => {
      await createUniversity(ownerId, { name: 'University of Twente', country: 'Netherlands' });
      const second = await createUniversity(ownerId, { name: 'University of Twente', country: 'NL' });

      expect(second.wasCreated).toBe(false);
      expect(second.university.country).toBe('Netherlands'); // unchanged — the second submission's "NL" was never written
      expect(second.conflictingFields).toEqual(['country']);
    });

    it('conflictingFields is empty when the resubmission matches the stored record exactly', async () => {
      await createUniversity(ownerId, { name: 'University of Twente', country: 'Netherlands' });
      const second = await createUniversity(ownerId, { name: 'University of Twente', country: 'Netherlands' });
      expect(second.conflictingFields).toEqual([]);
    });

    it('flags differing casing/whitespace in the submitted name itself as a conflicting field', async () => {
      await createUniversity(ownerId, { name: 'University of Twente' });
      const second = await createUniversity(ownerId, { name: 'university of twente' });
      expect(second.conflictingFields).toEqual(['name']);
    });

    it('creates concurrently without producing duplicates — the race is resolved by the unique index, not by a prior read', async () => {
      const owner = new Types.ObjectId().toString();
      const [a, b] = await Promise.all([
        createUniversity(owner, { name: 'Racing University' }),
        createUniversity(owner, { name: 'Racing University' }),
      ]);

      expect(String(a.university._id)).toBe(String(b.university._id));
      // Exactly one of the two concurrent calls actually inserted.
      expect([a.wasCreated, b.wasCreated].filter(Boolean)).toHaveLength(1);
      expect(await University.countDocuments({ ownerId: owner, normalizedName: 'racing university' })).toBe(1);
    });

    it('falls back to a plain read when the upsert itself loses a race with a duplicate-key error', async () => {
      // Simulates the documented MongoDB edge case where two concurrent
      // upserts against a brand-new unique key can have one resolve as a
      // clean match and the other throw E11000 instead — by seeding the
      // "winning" row directly (bypassing the service), then calling
      // createUniversity, which must still resolve to that row rather than
      // throwing.
      const owner = new Types.ObjectId().toString();
      const seeded = await University.create({
        ownerId: owner,
        name: 'Pre-seeded University',
        normalizedName: 'pre-seeded university',
      });

      const result = await createUniversity(owner, { name: 'Pre-seeded University' });
      expect(String(result.university._id)).toBe(String(seeded._id));
      expect(result.wasCreated).toBe(false);
      expect(await University.countDocuments({ ownerId: owner })).toBe(1);
    });
  });

  describe('listUniversities', () => {
    it('only returns universities owned by the caller', async () => {
      await makeUniversity(ownerId, { name: 'University of Twente' });
      await makeUniversity(otherOwnerId, { name: 'Delft University of Technology' });

      const result = await listUniversities(ownerId, {});
      expect(result.items.map((u) => u.name)).toEqual(['University of Twente']);
    });

    it('returns results ordered by name with keyset pagination', async () => {
      await makeUniversity(ownerId, { name: 'Utrecht University' });
      await makeUniversity(ownerId, { name: 'Delft University of Technology' });
      await makeUniversity(ownerId, { name: 'University of Amsterdam' });
      await makeUniversity(ownerId, { name: 'University of Twente' });

      const first = await listUniversities(ownerId, { limit: 2 });
      expect(first.items.map((u) => u.name)).toEqual([
        'Delft University of Technology',
        'University of Amsterdam',
      ]);
      expect(first.hasNextPage).toBe(true);
      expect(first.nextCursor).not.toBeNull();

      const second = await listUniversities(ownerId, { cursor: first.nextCursor! });
      expect(second.items.map((u) => u.name)).toEqual(['University of Twente', 'Utrecht University']);
      expect(second.hasNextPage).toBe(false);

      const allNames = [...first.items, ...second.items].map((u) => u.name);
      expect(new Set(allNames).size).toBe(allNames.length);
    });

    it('searches case-insensitively by substring', async () => {
      await makeUniversity(ownerId, { name: 'University of Twente' });
      await makeUniversity(ownerId, { name: 'Delft University of Technology' });

      const result = await listUniversities(ownerId, { search: 'twente' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('University of Twente');
    });

    it('treats regex-special characters in `search` as literal text', async () => {
      await makeUniversity(ownerId, { name: 'A+B University' });
      await makeUniversity(ownerId, { name: 'AB University' });

      const result = await listUniversities(ownerId, { search: 'A+B' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('A+B University');
    });
  });

  describe('getUniversityOrThrow', () => {
    it('returns the university when found and owned by the caller', async () => {
      const university = await makeUniversity(ownerId, { name: 'University of Twente' });
      const found = await getUniversityOrThrow(String(university._id), ownerId);
      expect(found.id).toBe(String(university._id));
    });

    it('throws NotFoundError for a university owned by someone else', async () => {
      const university = await makeUniversity(otherOwnerId, { name: 'University of Twente' });
      await expect(getUniversityOrThrow(String(university._id), ownerId)).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError for a missing id', async () => {
      await expect(getUniversityOrThrow('507f1f77bcf86cd799439011', ownerId)).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError (not a cast error) for a malformed id', async () => {
      await expect(getUniversityOrThrow('not-an-object-id', ownerId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateUniversity', () => {
    it('applies a partial update without touching other fields', async () => {
      const university = await makeUniversity(ownerId, { name: 'University of Twente' });
      const updated = await updateUniversity(String(university._id), ownerId, { country: 'Netherlands' });
      expect(updated.country).toBe('Netherlands');
      expect(updated.name).toBe('University of Twente');
    });

    it('recomputes normalizedName when name is changed', async () => {
      const university = await makeUniversity(ownerId, { name: 'University of Twente' });
      const updated = await updateUniversity(String(university._id), ownerId, { name: 'University of Amsterdam' });
      expect(updated.normalizedName).toBe('university of amsterdam');
    });

    it('throws NotFoundError instead of updating a university owned by someone else', async () => {
      const university = await makeUniversity(otherOwnerId, { name: 'University of Twente' });
      await expect(
        updateUniversity(String(university._id), ownerId, { country: 'Netherlands' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError instead of creating a row when missing', async () => {
      await expect(
        updateUniversity('507f1f77bcf86cd799439011', ownerId, { country: 'Netherlands' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteUniversity', () => {
    it('deletes an existing university owned by the caller', async () => {
      const university = await makeUniversity(ownerId, { name: 'University of Twente' });
      await deleteUniversity(String(university._id), ownerId);
      expect(await University.findById(university._id)).toBeNull();
    });

    it('throws NotFoundError instead of deleting a university owned by someone else', async () => {
      const university = await makeUniversity(otherOwnerId, { name: 'University of Twente' });
      await expect(deleteUniversity(String(university._id), ownerId)).rejects.toThrow(NotFoundError);
      expect(await University.findById(university._id)).not.toBeNull();
    });

    it('throws NotFoundError instead of deleting nothing when missing', async () => {
      await expect(deleteUniversity('507f1f77bcf86cd799439011', ownerId)).rejects.toThrow(NotFoundError);
    });
  });
});
