import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { University } from '../../models/university.model';
import { Programme } from '../../models/programme.model';
import { StudyLevel } from '../../lib/enums';
import { NotFoundError } from '../../lib/http-errors';
import { normalizeName } from '../../lib/normalize-name';
import {
  createProgramme,
  deleteProgramme,
  getProgrammeOrThrow,
  listProgrammes,
  updateProgramme,
} from '../programmes.service';
import type { CreateProgrammeInput } from '../../validation/programmes';

const ownerId = new Types.ObjectId().toString();
const otherOwnerId = new Types.ObjectId().toString();

async function university(owner: string, name: string) {
  return University.create({ ownerId: owner, name, normalizedName: normalizeName(name) });
}

/** Convenience for tests that only care about the resulting document, not the dedup metadata. */
async function makeProgramme(owner: string, input: CreateProgrammeInput) {
  const { programme } = await createProgramme(owner, input);
  return programme;
}

describe('programmes.service', () => {
  describe('createProgramme', () => {
    it('validates the university exists and is owned by the caller before creating the programme', async () => {
      const uni = await university(ownerId, 'University of Twente');
      const { programme, wasCreated, conflictingFields } = await createProgramme(ownerId, {
        universityId: String(uni._id),
        name: 'MSc Computer Science',
        studyLevel: StudyLevel.MASTERS,
      });
      expect(programme.name).toBe('MSc Computer Science');
      expect(programme.normalizedName).toBe('msc computer science');
      expect(String(programme.universityId)).toBe(String(uni._id));
      expect(String(programme.ownerId)).toBe(ownerId);
      expect(wasCreated).toBe(true);
      expect(conflictingFields).toEqual([]);
    });

    it('rejects when the university does not exist, without creating the programme', async () => {
      await expect(
        createProgramme(ownerId, { universityId: '507f1f77bcf86cd799439011', name: 'MSc Computer Science' }),
      ).rejects.toThrow(NotFoundError);
      expect(await Programme.countDocuments()).toBe(0);
    });

    it('rejects a university owned by someone else — cannot attach a programme to catalog identity you do not own', async () => {
      const uni = await university(otherOwnerId, 'University A');
      await expect(
        createProgramme(ownerId, { universityId: String(uni._id), name: 'MSc Computer Science' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('reuses an existing programme with the same normalized name under the same university, rather than duplicating it', async () => {
      const uni = await university(ownerId, 'University A');
      const first = await createProgramme(ownerId, { universityId: String(uni._id), name: 'MSc Computer Science' });
      const second = await createProgramme(ownerId, { universityId: String(uni._id), name: 'msc computer science' });
      expect(String(second.programme._id)).toBe(String(first.programme._id));
      expect(second.wasCreated).toBe(false);
      expect(await Programme.countDocuments()).toBe(1);
    });

    it('does not dedupe the same programme name across two different universities', async () => {
      const uniA = await university(ownerId, 'University A');
      const uniB = await university(ownerId, 'University B');
      const a = await createProgramme(ownerId, { universityId: String(uniA._id), name: 'MSc Computer Science' });
      const b = await createProgramme(ownerId, { universityId: String(uniB._id), name: 'MSc Computer Science' });
      expect(String(a.programme._id)).not.toBe(String(b.programme._id));
      expect(b.wasCreated).toBe(true);
      expect(await Programme.countDocuments()).toBe(2);
    });

    it('never overwrites the existing record\'s stored fields when a second submission differs', async () => {
      const uni = await university(ownerId, 'University A');
      await createProgramme(ownerId, { universityId: String(uni._id), name: 'MSc Computer Science', duration: '2 years' });
      const second = await createProgramme(ownerId, {
        universityId: String(uni._id),
        name: 'MSc Computer Science',
        duration: '18 months',
      });

      expect(second.wasCreated).toBe(false);
      expect(second.programme.duration).toBe('2 years'); // unchanged
      expect(second.conflictingFields).toEqual(['duration']);
    });

    it('creates concurrently without producing duplicates', async () => {
      const uni = await university(ownerId, 'Concurrency University');
      const [a, b] = await Promise.all([
        createProgramme(ownerId, { universityId: String(uni._id), name: 'Racing Programme' }),
        createProgramme(ownerId, { universityId: String(uni._id), name: 'Racing Programme' }),
      ]);
      expect(String(a.programme._id)).toBe(String(b.programme._id));
      expect([a.wasCreated, b.wasCreated].filter(Boolean)).toHaveLength(1);
      expect(
        await Programme.countDocuments({ ownerId, universityId: uni._id, normalizedName: 'racing programme' }),
      ).toBe(1);
    });

    it('falls back to a plain read when the upsert loses a race with a duplicate-key error', async () => {
      const uni = await university(ownerId, 'Seed University');
      const seeded = await Programme.create({
        ownerId,
        universityId: uni._id,
        name: 'Pre-seeded Programme',
        normalizedName: 'pre-seeded programme',
      });

      const result = await createProgramme(ownerId, { universityId: String(uni._id), name: 'Pre-seeded Programme' });
      expect(String(result.programme._id)).toBe(String(seeded._id));
      expect(result.wasCreated).toBe(false);
    });
  });

  describe('listProgrammes', () => {
    it('only returns programmes owned by the caller', async () => {
      const uni = await university(ownerId, 'University A');
      const otherUni = await university(otherOwnerId, 'University B');
      await makeProgramme(ownerId, { universityId: String(uni._id), name: 'MSc AI' });
      await Programme.create({
        ownerId: otherOwnerId,
        universityId: otherUni._id,
        name: 'BSc Physics',
        normalizedName: normalizeName('BSc Physics'),
      });

      const result = await listProgrammes(ownerId, {});
      expect(result.items.map((p) => p.name)).toEqual(['MSc AI']);
    });

    it('filters by universityId when given', async () => {
      const uniA = await university(ownerId, 'University A');
      const uniB = await university(ownerId, 'University B');
      await makeProgramme(ownerId, { universityId: String(uniA._id), name: 'MSc AI' });
      await makeProgramme(ownerId, { universityId: String(uniA._id), name: 'MSc Computer Science' });
      await makeProgramme(ownerId, { universityId: String(uniB._id), name: 'BSc Physics' });

      const result = await listProgrammes(ownerId, { universityId: String(uniA._id) });
      expect(result.items.map((p) => p.name).sort()).toEqual(['MSc AI', 'MSc Computer Science']);
    });

    it('lists every owned programme, ordered by name, when no filter is given', async () => {
      const uni = await university(ownerId, 'University A');
      await makeProgramme(ownerId, { universityId: String(uni._id), name: 'MSc AI' });
      await makeProgramme(ownerId, { universityId: String(uni._id), name: 'BSc Physics' });

      const result = await listProgrammes(ownerId, {});
      expect(result.items.map((p) => p.name)).toEqual(['BSc Physics', 'MSc AI']);
    });
  });

  describe('getProgrammeOrThrow', () => {
    it('throws NotFoundError for a programme owned by someone else', async () => {
      const uni = await university(otherOwnerId, 'University A');
      const programme = await Programme.create({
        ownerId: otherOwnerId,
        universityId: uni._id,
        name: 'MSc AI',
        normalizedName: normalizeName('MSc AI'),
      });
      await expect(getProgrammeOrThrow(String(programme._id), ownerId)).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError for a missing id', async () => {
      await expect(getProgrammeOrThrow('507f1f77bcf86cd799439011', ownerId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateProgramme', () => {
    it('leaves universityId unvalidated when the update does not touch it', async () => {
      const uni = await university(ownerId, 'University A');
      const programme = await makeProgramme(ownerId, { universityId: String(uni._id), name: 'MSc Computer Science' });

      const updated = await updateProgramme(String(programme._id), ownerId, { name: 'MSc AI' });
      expect(updated.name).toBe('MSc AI');
      expect(updated.normalizedName).toBe('msc ai');
      expect(String(updated.universityId)).toBe(String(uni._id));
    });

    it('re-validates the university when universityId IS being changed', async () => {
      const uniA = await university(ownerId, 'University A');
      const programme = await makeProgramme(ownerId, { universityId: String(uniA._id), name: 'MSc Computer Science' });

      await expect(
        updateProgramme(String(programme._id), ownerId, { universityId: '507f1f77bcf86cd799439011' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('re-parents the programme to a valid, different university owned by the caller', async () => {
      const uniA = await university(ownerId, 'University A');
      const uniB = await university(ownerId, 'University B');
      const programme = await makeProgramme(ownerId, { universityId: String(uniA._id), name: 'MSc Computer Science' });

      const updated = await updateProgramme(String(programme._id), ownerId, { universityId: String(uniB._id) });
      expect(String(updated.universityId)).toBe(String(uniB._id));
    });

    it('throws NotFoundError instead of updating a programme owned by someone else', async () => {
      const uni = await university(otherOwnerId, 'University A');
      const programme = await Programme.create({
        ownerId: otherOwnerId,
        universityId: uni._id,
        name: 'MSc AI',
        normalizedName: normalizeName('MSc AI'),
      });
      await expect(updateProgramme(String(programme._id), ownerId, { name: 'Hijacked' })).rejects.toThrow(
        NotFoundError,
      );
    });

    it('throws NotFoundError instead of creating a row when the programme is missing', async () => {
      await expect(
        updateProgramme('507f1f77bcf86cd799439011', ownerId, { name: 'MSc AI' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteProgramme', () => {
    it('deletes an existing programme owned by the caller', async () => {
      const uni = await university(ownerId, 'University A');
      const programme = await makeProgramme(ownerId, { universityId: String(uni._id), name: 'MSc Computer Science' });
      await deleteProgramme(String(programme._id), ownerId);
      expect(await Programme.findById(programme._id)).toBeNull();
    });

    it('throws NotFoundError instead of deleting nothing when missing', async () => {
      await expect(deleteProgramme('507f1f77bcf86cd799439011', ownerId)).rejects.toThrow(NotFoundError);
    });
  });
});
