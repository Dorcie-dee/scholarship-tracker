import { NotFoundException } from '@nestjs/common';
import { ProfileService } from './profile.service';

/**
 * Track 1 / §9 — closes the biggest test-coverage gap found in the Group A
 * inspection: this file didn't exist at all before this checkpoint.
 */
describe('ProfileService', () => {
  let profiles: any;
  let service: ProfileService;

  beforeEach(() => {
    profiles = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => ({ id: 'profile-1', ...row })),
      findOne: jest.fn(async () => null),
    };
    service = new ProfileService(profiles);
  });

  describe('createEmptyProfile', () => {
    it('creates a profile with every jsonb field correctly defaulted', async () => {
      const profile = await service.createEmptyProfile('user-1');

      expect(profile.userId).toBe('user-1');
      expect(profile.nationality).toBeNull();
      expect(profile.dateOfBirth).toBeNull();
      expect(profile.summary).toBeNull();
      expect(profile.education).toEqual([]);
      expect(profile.experience).toEqual([]);
      expect(profile.skills).toEqual([]);
      expect(profile.certifications).toEqual([]);
      expect(profile.languages).toEqual([]);
      expect(profile.metadata).toEqual({});
    });
  });

  describe('getByUserId', () => {
    it('returns the profile scoped to the given userId', async () => {
      const profile = { id: 'profile-1', userId: 'user-1' };
      profiles.findOne.mockResolvedValueOnce(profile);

      const result = await service.getByUserId('user-1');

      expect(result).toBe(profile);
      expect(profiles.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('throws NotFoundException when no profile exists for that user', async () => {
      await expect(service.getByUserId('user-without-profile')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('never accepts a profile id — only ever looks up by userId, so a caller cannot fetch by an arbitrary profile id belonging to someone else', async () => {
      await service.getByUserId('user-1').catch(() => undefined);
      const [[{ where }]] = profiles.findOne.mock.calls;
      expect(where).toEqual({ userId: 'user-1' });
      expect(where).not.toHaveProperty('id');
    });
  });

  describe('update', () => {
    it('reads the caller-owned profile, applies the partial update, and saves it', async () => {
      const existing = {
        id: 'profile-1',
        userId: 'user-1',
        nationality: null,
        summary: null,
      };
      profiles.findOne.mockResolvedValueOnce(existing);

      const result = await service.update('user-1', {
        nationality: 'Ghanaian',
        summary: 'Aspiring researcher',
      });

      expect(result.nationality).toBe('Ghanaian');
      expect(result.summary).toBe('Aspiring researcher');
      // Ownership: the update is scoped by userId via getByUserId — a
      // caller can never target another user's profile row, since there's
      // no id-based path into update() at all.
      expect(profiles.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('throws NotFoundException instead of creating a row when the profile is missing', async () => {
      await expect(
        service.update('user-without-profile', { summary: 'x' }),
      ).rejects.toThrow(NotFoundException);
      expect(profiles.save).not.toHaveBeenCalled();
    });

    it('leaves fields not present in the DTO untouched', async () => {
      const existing = {
        id: 'profile-1',
        userId: 'user-1',
        nationality: 'Ghanaian',
        summary: 'Original summary',
        skills: ['TypeScript'],
      };
      profiles.findOne.mockResolvedValueOnce(existing);

      const result = await service.update('user-1', { summary: 'Updated' });

      expect(result.summary).toBe('Updated');
      expect(result.nationality).toBe('Ghanaian'); // untouched
      expect(result.skills).toEqual(['TypeScript']); // untouched
    });

    it('does not leak a passwordHash or any user-table field — a profile row structurally has none to leak', async () => {
      const existing = { id: 'profile-1', userId: 'user-1' };
      profiles.findOne.mockResolvedValueOnce(existing);

      const result = await service.update('user-1', { summary: 'x' });

      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('password');
    });
  });
});
