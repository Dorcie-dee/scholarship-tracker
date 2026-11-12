import { describe, expect, it } from 'vitest';
import { User } from '../../models/user.model';
import { ApplicantProfile } from '../../models/applicant-profile.model';
import { ApplicationJourney } from '../../models/application-journey.model';
import { Application } from '../../models/application.model';
import { Task } from '../../models/task.model';
import { Requirement } from '../../models/requirement.model';
import { Deadline } from '../../models/deadline.model';
import { ApplicationDocument } from '../../models/application-document.model';
import { ApplicationSnapshot } from '../../models/application-snapshot.model';
import { Document } from '../../models/document.model';
import { RefreshSession } from '../../models/refresh-session.model';
import { EmailVerificationOtp } from '../../models/email-verification-otp.model';
import { PasswordResetToken } from '../../models/password-reset-token.model';
import { UserRole } from '../../lib/enums';
import { hashPassword } from '../../lib/auth';
import { BadRequestError, ForbiddenError } from '../../lib/http-errors';
import { eraseAccount, listDirectory, updateMe, updateRole } from '../users.service';

async function createUser(overrides: Partial<{ email: string; name: string | null; role: UserRole }> = {}) {
  const passwordHash = await hashPassword('Password123!');
  return User.create({
    email: overrides.email ?? `user-${Date.now()}-${Math.random()}@example.test`,
    passwordHash,
    name: overrides.name ?? 'Test User',
    role: overrides.role ?? UserRole.USER,
    isVerified: true,
  });
}

describe('users.service', () => {
  describe('updateMe', () => {
    it('updates the name but never changes role even if sent', async () => {
      const user = await createUser({ role: UserRole.USER });

      const updated = await updateMe(String(user._id), {
        name: 'New Name',
        // A role field should never reach the DB write, even if a caller
        // constructs the input object directly, bypassing the `.strict()`
        // zod schema that would normally reject it at the route layer.
        role: UserRole.ADMIN,
      } as never);

      expect(updated.name).toBe('New Name');
      expect(updated.role).toBe(UserRole.USER);

      const reloaded = await User.findById(user._id);
      expect(reloaded?.role).toBe(UserRole.USER);
    });

    it('leaves the name untouched when not provided', async () => {
      const user = await createUser({ name: 'Original Name' });
      const updated = await updateMe(String(user._id), {});
      expect(updated.name).toBe('Original Name');
    });
  });

  describe('updateRole', () => {
    it('forbids changing your own role', async () => {
      const admin = await createUser({ role: UserRole.ADMIN });
      await expect(updateRole(String(admin._id), String(admin._id), UserRole.USER)).rejects.toThrow(
        ForbiddenError,
      );
    });

    it('forbids demoting the last remaining admin', async () => {
      const admin = await createUser({ role: UserRole.ADMIN });
      const actor = await createUser({ role: UserRole.USER });

      await expect(updateRole(String(actor._id), String(admin._id), UserRole.USER)).rejects.toThrow(
        BadRequestError,
      );

      const reloaded = await User.findById(admin._id);
      expect(reloaded?.role).toBe(UserRole.ADMIN);
    });

    it('allows demoting an admin when another admin remains', async () => {
      const adminOne = await createUser({ role: UserRole.ADMIN });
      const adminTwo = await createUser({ role: UserRole.ADMIN });

      const updated = await updateRole(String(adminOne._id), String(adminTwo._id), UserRole.USER);
      expect(updated.role).toBe(UserRole.USER);

      const reloadedOne = await User.findById(adminOne._id);
      expect(reloadedOne?.role).toBe(UserRole.ADMIN);
    });

    it('allows promoting a user to admin', async () => {
      const admin = await createUser({ role: UserRole.ADMIN });
      const user = await createUser({ role: UserRole.USER });

      const updated = await updateRole(String(admin._id), String(user._id), UserRole.ADMIN);
      expect(updated.role).toBe(UserRole.ADMIN);
    });
  });

  describe('listDirectory', () => {
    it('filters by role and search substring', async () => {
      await createUser({ email: 'ada@example.test', name: 'Ada Lovelace', role: UserRole.ADMIN });
      await createUser({ email: 'bob@example.test', name: 'Bob Builder', role: UserRole.USER });

      const adminsOnly = await listDirectory({ role: UserRole.ADMIN });
      expect(adminsOnly.items).toHaveLength(1);
      expect(adminsOnly.items[0].email).toBe('ada@example.test');
      // Never exposes the password hash.
      expect(adminsOnly.items[0]).not.toHaveProperty('passwordHash');

      const bySearch = await listDirectory({ search: 'bob' });
      expect(bySearch.items).toHaveLength(1);
      expect(bySearch.items[0].email).toBe('bob@example.test');
    });
  });

  describe('eraseAccount', () => {
    it('removes every owned row across every collection, cascading through journeys/applications', async () => {
      const user = await createUser();
      const userId = String(user._id);

      await ApplicantProfile.create({ userId });

      const journey = await ApplicationJourney.create({ userId, title: 'My Journey' });
      const application = await Application.create({
        journeyId: journey._id,
        title: 'My Application',
      });
      const task = await Task.create({
        journeyId: journey._id,
        applicationId: application._id,
        title: 'My Task',
      });
      const requirement = await Requirement.create({
        applicationId: application._id,
        description: 'Submit transcript',
      });
      const deadline = await Deadline.create({
        applicationId: application._id,
        taskId: task._id,
        requirementId: requirement._id,
        label: 'Submission deadline',
        date: new Date('2027-01-01'),
      });
      const snapshot = await ApplicationSnapshot.create({
        applicationId: application._id,
        data: { status: 'in_progress' },
      });
      const document = await Document.create({
        ownerId: userId,
        title: 'Transcript',
        cloudinaryPublicId: 'schola/test-doc',
        cloudinaryUrl: 'https://example.test/doc.pdf',
      });
      const applicationDocument = await ApplicationDocument.create({
        applicationId: application._id,
        documentId: document._id,
        attachedAt: new Date(),
      });
      await RefreshSession.create({
        userId,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 1000 * 60),
        lastUsedAt: new Date(),
      });
      await EmailVerificationOtp.create({
        userId,
        otpHash: 'hash',
        expiresAt: new Date(Date.now() + 1000 * 60),
      });
      await PasswordResetToken.create({
        userId,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 1000 * 60),
      });

      await eraseAccount(userId);

      expect(await User.findById(userId)).toBeNull();
      expect(await ApplicantProfile.countDocuments({ userId })).toBe(0);
      expect(await ApplicationJourney.countDocuments({ userId })).toBe(0);
      expect(await Application.countDocuments({ _id: application._id })).toBe(0);
      expect(await Task.countDocuments({ _id: task._id })).toBe(0);
      expect(await Requirement.countDocuments({ _id: requirement._id })).toBe(0);
      expect(await Deadline.countDocuments({ _id: deadline._id })).toBe(0);
      expect(await ApplicationSnapshot.countDocuments({ _id: snapshot._id })).toBe(0);
      expect(await Document.countDocuments({ _id: document._id })).toBe(0);
      expect(await ApplicationDocument.countDocuments({ _id: applicationDocument._id })).toBe(0);
      expect(await RefreshSession.countDocuments({ userId })).toBe(0);
      expect(await EmailVerificationOtp.countDocuments({ userId })).toBe(0);
      expect(await PasswordResetToken.countDocuments({ userId })).toBe(0);
    });

    it('is a no-op (does not throw) for an already-nonexistent / malformed id', async () => {
      await expect(eraseAccount('not-a-valid-object-id')).resolves.toBeUndefined();
    });
  });
});
