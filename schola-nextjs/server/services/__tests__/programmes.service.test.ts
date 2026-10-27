import { describe, expect, it } from 'vitest';
import { University } from '../../models/university.model';
import { Programme } from '../../models/programme.model';
import { StudyLevel } from '../../lib/enums';
import { NotFoundError } from '../../lib/http-errors';
import {
  createProgramme,
  deleteProgramme,
  getProgrammeOrThrow,
  listProgrammes,
  updateProgramme,
} from '../programmes.service';

describe('programmes.service', () => {
  describe('createProgramme', () => {
    it('validates the university exists before creating the programme', async () => {
      const university = await University.create({ name: 'University of Twente' });
      const programme = await createProgramme({
        universityId: String(university._id),
        name: 'MSc Computer Science',
        studyLevel: StudyLevel.MASTERS,
      });
      expect(programme.name).toBe('MSc Computer Science');
      expect(String(programme.universityId)).toBe(String(university._id));
    });

    it('rejects when the university does not exist, without creating the programme', async () => {
      await expect(
        createProgramme({ universityId: '507f1f77bcf86cd799439011', name: 'MSc Computer Science' }),
      ).rejects.toThrow(NotFoundError);
      expect(await Programme.countDocuments()).toBe(0);
    });
  });

  describe('listProgrammes', () => {
    it('filters by universityId when given', async () => {
      const uniA = await University.create({ name: 'University A' });
      const uniB = await University.create({ name: 'University B' });
      await Programme.create({ universityId: uniA._id, name: 'MSc AI' });
      await Programme.create({ universityId: uniA._id, name: 'MSc Computer Science' });
      await Programme.create({ universityId: uniB._id, name: 'BSc Physics' });

      const result = await listProgrammes({ universityId: String(uniA._id) });
      expect(result.items.map((p) => p.name).sort()).toEqual(['MSc AI', 'MSc Computer Science']);
    });

    it('lists every programme, ordered by name, when no filter is given', async () => {
      const uni = await University.create({ name: 'University A' });
      await Programme.create({ universityId: uni._id, name: 'MSc AI' });
      await Programme.create({ universityId: uni._id, name: 'BSc Physics' });

      const result = await listProgrammes({});
      expect(result.items.map((p) => p.name)).toEqual(['BSc Physics', 'MSc AI']);
    });
  });

  describe('getProgrammeOrThrow', () => {
    it('throws NotFoundError for a missing id', async () => {
      await expect(getProgrammeOrThrow('507f1f77bcf86cd799439011')).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateProgramme', () => {
    it('leaves universityId unvalidated when the update does not touch it', async () => {
      const uni = await University.create({ name: 'University A' });
      const programme = await Programme.create({ universityId: uni._id, name: 'MSc Computer Science' });

      const updated = await updateProgramme(String(programme._id), { name: 'MSc AI' });
      expect(updated.name).toBe('MSc AI');
      expect(String(updated.universityId)).toBe(String(uni._id));
    });

    it('re-validates the university when universityId IS being changed', async () => {
      const uniA = await University.create({ name: 'University A' });
      const programme = await Programme.create({ universityId: uniA._id, name: 'MSc Computer Science' });

      await expect(
        updateProgramme(String(programme._id), { universityId: '507f1f77bcf86cd799439011' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('re-parents the programme to a valid, different university', async () => {
      const uniA = await University.create({ name: 'University A' });
      const uniB = await University.create({ name: 'University B' });
      const programme = await Programme.create({ universityId: uniA._id, name: 'MSc Computer Science' });

      const updated = await updateProgramme(String(programme._id), { universityId: String(uniB._id) });
      expect(String(updated.universityId)).toBe(String(uniB._id));
    });

    it('throws NotFoundError instead of creating a row when the programme is missing', async () => {
      await expect(
        updateProgramme('507f1f77bcf86cd799439011', { name: 'MSc AI' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteProgramme', () => {
    it('deletes an existing programme', async () => {
      const uni = await University.create({ name: 'University A' });
      const programme = await Programme.create({ universityId: uni._id, name: 'MSc Computer Science' });
      await deleteProgramme(String(programme._id));
      expect(await Programme.findById(programme._id)).toBeNull();
    });

    it('throws NotFoundError instead of deleting nothing when missing', async () => {
      await expect(deleteProgramme('507f1f77bcf86cd799439011')).rejects.toThrow(NotFoundError);
    });
  });
});
