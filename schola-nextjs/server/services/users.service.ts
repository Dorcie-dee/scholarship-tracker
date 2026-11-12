import type { ClientSession, FilterQuery, HydratedDocument } from 'mongoose';
import { Types } from 'mongoose';
import { User, type UserDoc } from '../models/user.model';
import { ApplicantProfile } from '../models/applicant-profile.model';
import { ApplicationJourney } from '../models/application-journey.model';
import { Application } from '../models/application.model';
import { Task } from '../models/task.model';
import { Requirement } from '../models/requirement.model';
import { Deadline } from '../models/deadline.model';
import { ApplicationDocument } from '../models/application-document.model';
import { ApplicationSnapshot } from '../models/application-snapshot.model';
import { Document } from '../models/document.model';
import { RefreshSession } from '../models/refresh-session.model';
import { EmailVerificationOtp } from '../models/email-verification-otp.model';
import { PasswordResetToken } from '../models/password-reset-token.model';
import { UserRole } from '../lib/enums';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/http-errors';
import { paginate } from '../lib/pagination';
import { withTransaction } from '../lib/db';
import { deleteByPublicId } from '../lib/cloudinary';
import type { ListUsersQuery, UpdateUserInput } from '../validation/users';

/**
 * Users (ADMIN directory + self-service) + account erasure. Ported from the
 * original NestJS backend's `users.service.ts` and `account-erasure.service.ts`.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Defined locally (not imported from `server/validation/common.ts`) — that
 * module is owned/actively being written by another concurrent agent and
 * its exports were still changing shape as of this port; keeping this
 * module self-contained avoids a cross-module coupling hazard.
 */
function isValidObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id);
}

export async function getByIdOrThrow(userId: string): Promise<HydratedDocument<UserDoc>> {
  if (!isValidObjectId(userId)) {
    throw new NotFoundError('User not found');
  }
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return user;
}

/**
 * Explicit field allowlist — mirrors the original `UsersService.update()`'s
 * comment ("never passes role or passwordHash"). `updateUserSchema` is
 * already `.strict()` with only `name`, so this is defense in depth: even
 * if a caller constructs the input object directly (bypassing the zod
 * layer), only `name` is ever written.
 */
export async function updateMe(
  userId: string,
  input: UpdateUserInput,
): Promise<HydratedDocument<UserDoc>> {
  if (input.name !== undefined) {
    await User.updateOne({ _id: userId }, { $set: { name: input.name } });
  }
  return getByIdOrThrow(userId);
}

export interface AdminUserDirectoryItem {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  isVerified: boolean;
  createdAt: Date;
}

export interface AdminUserDirectoryPage {
  items: AdminUserDirectoryItem[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

/**
 * ADMIN-only directory: keyset-paginated, searchable, never returns secrets.
 * Ordered by `(createdAt, id)` DESC by default — newest accounts first.
 * `search` is a case-insensitive substring match against email/name (the
 * Mongo equivalent of the original's leading-wildcard `ILIKE`).
 */
export async function listDirectory(query: ListUsersQuery): Promise<AdminUserDirectoryPage> {
  const filter: FilterQuery<UserDoc> = {};
  if (query.role) {
    filter.role = query.role;
  }
  const search = query.search?.trim();
  if (search) {
    const pattern = { $regex: escapeRegExp(search), $options: 'i' };
    filter.$or = [{ email: pattern }, { name: pattern }];
  }

  const page = await paginate(User, {
    filter,
    sortField: 'createdAt',
    sortOrder: query.order ?? 'desc',
    cursor: query.cursor ?? null,
    limit: query.limit ?? null,
  });

  return {
    items: page.items.map((u) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.role,
      isVerified: u.isVerified,
      createdAt: u.createdAt,
    })),
    nextCursor: page.nextCursor,
    hasNextPage: page.hasNextPage,
  };
}

/**
 * ADMIN-only role change for another user. Self-change forbidden; demoting
 * the last remaining ADMIN forbidden. Runs inside a transaction so the
 * admin-count check and the write are atomic under concurrent demotions.
 *
 * Deviation from the original: the original's `RolesGuard` re-reads the
 * live DB role on every `@Roles()`-guarded route (so a demotion takes
 * effect immediately even if an already-issued JWT still claims ADMIN).
 * This port's `withRoute({ roles })` wrapper (`server/lib/api-handler.ts`,
 * shared foundation — not owned by this module) only checks the JWT's own
 * `role` claim, with no live DB re-check. A demoted admin therefore keeps
 * ADMIN-gated API access for the remainder of their access token's TTL.
 * Flagged here rather than worked around locally, since fixing it properly
 * means changing `withRoute` itself (see this port's final report).
 */
export async function updateRole(
  actorUserId: string,
  targetUserId: string,
  role: UserRole,
): Promise<HydratedDocument<UserDoc>> {
  if (actorUserId === targetUserId) {
    throw new ForbiddenError('You cannot change your own role');
  }
  if (!isValidObjectId(targetUserId)) {
    throw new NotFoundError('User not found');
  }

  return withTransaction(async (session) => {
    const target = await User.findById(targetUserId).session(session);
    if (!target) {
      throw new NotFoundError('User not found');
    }

    const previousRole = target.role;
    if (previousRole === role) {
      return target;
    }

    if (previousRole === UserRole.ADMIN && role === UserRole.USER) {
      const adminCount = await User.countDocuments({ role: UserRole.ADMIN }).session(session);
      if (adminCount <= 1) {
        throw new BadRequestError('Cannot demote the last remaining administrator');
      }
    }

    target.role = role;
    await target.save({ session });

    // Structured audit line — matches the original's `user.role_changed` log event.
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        event: 'user.role_changed',
        actorUserId,
        targetUserId,
        previousRole,
        newRole: role,
      }),
    );

    return target;
  });
}

function resolveResourceType(doc: {
  cloudinaryResourceType: string | null;
  mimeType: string | null;
}): 'image' | 'raw' | 'video' {
  if (doc.cloudinaryResourceType === 'image') return 'image';
  if (doc.cloudinaryResourceType === 'video') return 'video';
  if (doc.cloudinaryResourceType === 'raw') return 'raw';
  return doc.mimeType?.startsWith('image/') ? 'image' : 'raw';
}

/**
 * Full account erasure (`DELETE /users/me`) — irreversible, immediate, not
 * soft-deleted. Ported from the original NestJS backend's
 * `AccountErasureService.eraseAccount()`.
 *
 * MongoDB has no DB-level `onDelete: 'CASCADE'` (unlike every relevant FK in
 * the original Postgres schema), so every collection a user transitively
 * owns is deleted explicitly here, inside one transaction:
 *   1. Resolve this user's ApplicationJourney ids.
 *   2. Resolve every Application under those journeys (not filtered by
 *      `deletedAt` — a soft-deleted Application must still be erased).
 *   3. Resolve every Task under those journeys, and every Requirement under
 *      those applications (both are referenced by Deadline).
 *   4. Delete ApplicationSnapshot, ApplicationDocument, and Deadline rows
 *      scoped to those applications/tasks/requirements.
 *   5. Delete Requirement, then Task, then Application, then
 *      ApplicationJourney rows.
 *   6. Read this user's own Document rows (id + Cloudinary identity), then
 *      delete any ApplicationDocument still pointing at one of them (a
 *      document can in principle be attached to an application outside the
 *      deletion scope above) before deleting the Document rows themselves.
 *   7. Delete ApplicantProfile, RefreshSession, EmailVerificationOtp,
 *      PasswordResetToken, and finally the User row.
 * Only after the transaction commits does this function attempt the
 * Cloudinary deletes (an external, non-transactional call) — same
 * DB-truth-first-then-external-side-effect ordering as the original.
 * `Promise.allSettled` — one failed Cloudinary delete is logged, never
 * aborts the rest; the account is already gone from the database regardless.
 */
export async function eraseAccount(userId: string): Promise<void> {
  if (!isValidObjectId(userId)) {
    return;
  }

  const documentsToClean: { publicId: string; resourceType: 'image' | 'raw' | 'video' }[] =
    await withTransaction(async (session: ClientSession) => {
      const journeys = await ApplicationJourney.find({ userId }, { _id: 1 }).session(session);
      const journeyIds = journeys.map((j) => j._id);

      const applications = await Application.find({ journeyId: { $in: journeyIds } }, { _id: 1 }).session(
        session,
      );
      const applicationIds = applications.map((a) => a._id);

      const tasks = await Task.find({ journeyId: { $in: journeyIds } }, { _id: 1 }).session(session);
      const taskIds = tasks.map((t) => t._id);

      const requirements = await Requirement.find(
        { applicationId: { $in: applicationIds } },
        { _id: 1 },
      ).session(session);
      const requirementIds = requirements.map((r) => r._id);

      await ApplicationSnapshot.deleteMany({ applicationId: { $in: applicationIds } }).session(session);
      await ApplicationDocument.deleteMany({ applicationId: { $in: applicationIds } }).session(session);
      await Deadline.deleteMany({
        $or: [
          { applicationId: { $in: applicationIds } },
          { taskId: { $in: taskIds } },
          { requirementId: { $in: requirementIds } },
        ],
      }).session(session);
      await Requirement.deleteMany({ applicationId: { $in: applicationIds } }).session(session);
      await Task.deleteMany({ journeyId: { $in: journeyIds } }).session(session);
      await Application.deleteMany({ journeyId: { $in: journeyIds } }).session(session);
      await ApplicationJourney.deleteMany({ userId }).session(session);

      const ownedDocuments = await Document.find(
        { ownerId: userId },
        { _id: 1, cloudinaryPublicId: 1, cloudinaryResourceType: 1, mimeType: 1 },
      ).session(session);
      const documentIds = ownedDocuments.map((d) => d._id);

      // An owned document could in principle be attached to an application
      // outside this user's own journeys — clear any such dangling
      // attachment before the Document rows themselves disappear.
      await ApplicationDocument.deleteMany({ documentId: { $in: documentIds } }).session(session);
      await Document.deleteMany({ ownerId: userId }).session(session);

      await ApplicantProfile.deleteMany({ userId }).session(session);
      await RefreshSession.deleteMany({ userId }).session(session);
      await EmailVerificationOtp.deleteMany({ userId }).session(session);
      await PasswordResetToken.deleteMany({ userId }).session(session);
      await User.deleteOne({ _id: userId }).session(session);

      return ownedDocuments.map((d) => ({
        publicId: d.cloudinaryPublicId,
        resourceType: resolveResourceType(d),
      }));
    });

  const results = await Promise.allSettled(
    documentsToClean.map(({ publicId, resourceType }) => deleteByPublicId(publicId, resourceType)),
  );

  const failures = results.filter((r) => r.status === 'rejected').length;
  if (failures > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `Account erasure for user ${userId}: ${failures} of ${documentsToClean.length} Cloudinary ` +
        'asset(s) failed to delete after the database rows were already removed. Manual cleanup may be required.',
    );
  }
}
