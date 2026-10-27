import { describe, expect, it } from 'vitest';
import { University } from '../../models/university.model';
import { NotFoundError } from '../../lib/http-errors';
import {
  createUniversity,
  deleteUniversity,
  getUniversityOrThrow,
  listUniversities,
  updateUniversity,
} from '../universities.service';

describe('universities.service', () => {
  describe('createUniversity', () => {
    it('creates and persists a university', async () => {
      const university = await createUniversity({ name: 'University of Twente', country: 'Netherlands' });
      expect(university.name).toBe('University of Twente');

      const reloaded = await University.findById(university._id);
      expect(reloaded?.country).toBe('Netherlands');
    });
  });

  describe('listUniversities', () => {
    it('returns results ordered by name with keyset pagination', async () => {
      await University.create({ name: 'Utrecht University' });
      await University.create({ name: 'Delft University of Technology' });
      await University.create({ name: 'University of Amsterdam' });
      await University.create({ name: 'University of Twente' });

      const first = await listUniversities({ limit: 2 });
      expect(first.items.map((u) => u.name)).toEqual([
        'Delft University of Technology',
        'University of Amsterdam',
      ]);
      expect(first.hasNextPage).toBe(true);
      expect(first.nextCursor).not.toBeNull();

      const second = await listUniversities({ cursor: first.nextCursor! });
      expect(second.items.map((u) => u.name)).toEqual(['University of Twente', 'Utrecht University']);
      expect(second.hasNextPage).toBe(false);

      const allNames = [...first.items, ...second.items].map((u) => u.name);
      expect(new Set(allNames).size).toBe(allNames.length);
    });

    it('searches case-insensitively by substring', async () => {
      await University.create({ name: 'University of Twente' });
      await University.create({ name: 'Delft University of Technology' });

      const result = await listUniversities({ search: 'twente' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('University of Twente');
    });

    it('treats regex-special characters in `search` as literal text', async () => {
      await University.create({ name: 'A+B University' });
      await University.create({ name: 'AB University' });

      const result = await listUniversities({ search: 'A+B' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('A+B University');
    });
  });

  describe('getUniversityOrThrow', () => {
    it('returns the university when found', async () => {
      const university = await University.create({ name: 'University of Twente' });
      const found = await getUniversityOrThrow(String(university._id));
      expect(found.id).toBe(String(university._id));
    });

    it('throws NotFoundError for a missing id', async () => {
      await expect(getUniversityOrThrow('507f1f77bcf86cd799439011')).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError (not a cast error) for a malformed id', async () => {
      await expect(getUniversityOrThrow('not-an-object-id')).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateUniversity', () => {
    it('applies a partial update without touching other fields', async () => {
      const university = await University.create({ name: 'University of Twente', country: null });
      const updated = await updateUniversity(String(university._id), { country: 'Netherlands' });
      expect(updated.country).toBe('Netherlands');
      expect(updated.name).toBe('University of Twente');
    });

    it('throws NotFoundError instead of creating a row when missing', async () => {
      await expect(
        updateUniversity('507f1f77bcf86cd799439011', { country: 'Netherlands' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteUniversity', () => {
    it('deletes an existing university', async () => {
      const university = await University.create({ name: 'University of Twente' });
      await deleteUniversity(String(university._id));
      expect(await University.findById(university._id)).toBeNull();
    });

    it('throws NotFoundError instead of deleting nothing when missing', async () => {
      await expect(deleteUniversity('507f1f77bcf86cd799439011')).rejects.toThrow(NotFoundError);
    });
  });
});
