import type { HydratedDocument } from 'mongoose';
import { ApplicantProfile, type ApplicantProfileDoc } from '../models/applicant-profile.model';
import { NotFoundError } from '../lib/http-errors';
import type { UpdateProfileInput } from '../validation/profile';

/**
 * The applicant's "Master Profile" — one per user. Ported from the original
 * NestJS backend's `profile.service.ts`.
 */

/**
 * Called once at registration (see `server/services/auth.service.ts`, ported
 * concurrently) so every user has exactly one profile row. Exported here
 * (not duplicated) so the auth module can create it without reimplementing
 * the empty-profile shape.
 */
export async function createEmptyProfile(userId: string): Promise<HydratedDocument<ApplicantProfileDoc>> {
  return ApplicantProfile.create({
    userId,
    nationality: null,
    dateOfBirth: null,
    summary: null,
    education: [],
    experience: [],
    skills: [],
    certifications: [],
    languages: [],
    metadata: {},
  });
}

export async function getProfile(userId: string): Promise<HydratedDocument<ApplicantProfileDoc>> {
  const profile = await ApplicantProfile.findOne({ userId });
  if (!profile) {
    throw new NotFoundError('Profile not found');
  }
  return profile;
}

/**
 * Partial update — every field present in `input` replaces that field
 * outright (not merged/appended), matching the original's
 * `Object.assign(profile, dto)`. A field left out of `input` is untouched.
 */
export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<HydratedDocument<ApplicantProfileDoc>> {
  const profile = await getProfile(userId);
  Object.assign(profile, input);
  await profile.save();
  return profile;
}
