import { NotFoundException } from '@nestjs/common';
import { ILike } from 'typeorm';
import { UniversitiesService } from './universities.service';

/**
 * Track 1 Group B — closes this service's previous zero-test-coverage gap.
 * University is shared catalog data (no ownership, no @CurrentUser() —
 * confirmed by inspecting the controller); these tests reflect that: no
 * ownership scenarios to cover, focus is on the actual service logic that
 * existed (search, existence checks) plus the F4 whitespace-validation fix
 * verified at the DTO layer separately (see create-university.dto — covered
 * in its own describe block below via class-validator directly).
 */
describe('UniversitiesService', () => {
  let universities: any;
  let service: UniversitiesService;

  beforeEach(() => {
    universities = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => ({ id: 'university-1', ...row })),
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      delete: jest.fn(async () => ({ affected: 1 })),
    };
    service = new UniversitiesService(universities);
  });

  describe('create', () => {
    it('creates and persists a university', async () => {
      const dto = { name: 'University of Twente', country: 'Netherlands' };
      const result = await service.create(dto);

      expect(universities.create).toHaveBeenCalledWith(dto);
      expect(universities.save).toHaveBeenCalled();
      expect(result.name).toBe('University of Twente');
    });
  });

  describe('findAll', () => {
    it('lists all universities, ordered by name, when no search term is given', async () => {
      await service.findAll();
      expect(universities.find).toHaveBeenCalledWith({
        where: {},
        order: { name: 'ASC' },
      });
    });

    it('searches case-insensitively via ILIKE when a search term is given', async () => {
      await service.findAll('twente');
      expect(universities.find).toHaveBeenCalledWith({
        where: { name: ILike('%twente%') },
        order: { name: 'ASC' },
      });
    });
  });

  describe('findOneOrThrow', () => {
    it('returns the university when found', async () => {
      const uni = { id: 'university-1', name: 'University of Twente' };
      universities.findOne.mockResolvedValueOnce(uni);
      await expect(service.findOneOrThrow('university-1')).resolves.toBe(uni);
    });

    it('throws NotFoundException when not found', async () => {
      await expect(service.findOneOrThrow('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('applies a partial update to an existing university', async () => {
      universities.findOne.mockResolvedValueOnce({
        id: 'university-1',
        name: 'University of Twente',
        country: null,
      });

      const result = await service.update('university-1', {
        country: 'Netherlands',
      });

      expect(result.country).toBe('Netherlands');
      expect(result.name).toBe('University of Twente'); // untouched
    });

    it('throws NotFoundException instead of creating a row when the university is missing', async () => {
      await expect(
        service.update('missing', { country: 'Netherlands' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(universities.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes an existing university', async () => {
      universities.findOne.mockResolvedValueOnce({ id: 'university-1' });
      await service.remove('university-1');
      expect(universities.delete).toHaveBeenCalledWith('university-1');
    });

    it('throws NotFoundException instead of deleting nothing when the university is missing', async () => {
      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(universities.delete).not.toHaveBeenCalled();
    });
  });
});
