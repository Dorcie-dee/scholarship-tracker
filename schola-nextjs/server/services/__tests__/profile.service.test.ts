import { describe, expect, it } from 'vitest';
import { User } from '../../models/user.model';
import { hashPassword } from '../../lib/auth';
import { NotFoundError } from '../../lib/http-errors';
import { createEmptyProfile, getProfile, updateProfile } from '../profile.service';

async function createUserId(): Promise<string> {
  const passwordHash = await hashPassword('Password123!');
  const user = await User.create({
    email: `user-${Date.now()}-${Math.random()}@example.test`,
    passwordHash,
  });
  return String(user._id);
}

describe('profile.service', () => {
  it('creates an empty profile with every array field empty and metadata {}', async () => {
    const userId = await createUserId();
    const profile = await createEmptyProfile(userId);

    expect(profile.nationality).toBeNull();
    expect(profile.education).toEqual([]);
    expect(profile.experience).toEqual([]);
    expect(profile.skills).toEqual([]);
    expect(profile.certifications).toEqual([]);
    expect(profile.languages).toEqual([]);
    expect(profile.metadata).toEqual({});
  });

  it('throws NotFoundError when no profile exists yet', async () => {
    const userId = await createUserId();
    await expect(getProfile(userId)).rejects.toThrow(NotFoundError);
  });

  it('partial update only touches the fields sent, leaving the rest untouched', async () => {
    const userId = await createUserId();
    await createEmptyProfile(userId);

    await updateProfile(userId, {
      nationality: 'Ghanaian',
      skills: [{ name: 'TypeScript' }],
    });

    const afterFirstUpdate = await getProfile(userId);
    expect(afterFirstUpdate.nationality).toBe('Ghanaian');
    expect(afterFirstUpdate.skills).toEqual([{ name: 'TypeScript' }]);
    expect(afterFirstUpdate.summary).toBeNull();
    expect(afterFirstUpdate.education).toEqual([]);

    // A second, disjoint partial update must not disturb the first update's fields.
    await updateProfile(userId, { summary: 'A short personal statement.' });

    const afterSecondUpdate = await getProfile(userId);
    expect(afterSecondUpdate.summary).toBe('A short personal statement.');
    expect(afterSecondUpdate.nationality).toBe('Ghanaian');
    expect(afterSecondUpdate.skills).toEqual([{ name: 'TypeScript' }]);
  });

  it('replaces an array field outright rather than merging/appending', async () => {
    const userId = await createUserId();
    await createEmptyProfile(userId);

    await updateProfile(userId, { education: [{ degree: 'BSc' }, { degree: 'MSc' }] });
    await updateProfile(userId, { education: [{ degree: 'PhD' }] });

    const profile = await getProfile(userId);
    expect(profile.education).toEqual([{ degree: 'PhD' }]);
  });
});
