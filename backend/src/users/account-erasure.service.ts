import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { ApplicationJourney } from '../journeys/entities/application-journey.entity';
import { Document } from '../documents/entities/document.entity';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';

/**
 * Production hardening (Batch 7) — `DELETE /users/me`, full account erasure.
 *
 * Injected directly against `User`/`ApplicationJourney`/`Document`
 * repositories and `CloudinaryService` (not `JourneysService`/
 * `DocumentsService`) — same reasoning already established throughout this
 * codebase (`ApplicationsService`'s direct `Requirement` injection, etc.):
 * importing `JourneysModule`/`DocumentsModule` into `UsersModule` risks a
 * circular dependency, since much of the domain graph already depends on
 * `UsersModule` indirectly (ownership checks resolve back to a `userId`).
 * Direct repository injection sidesteps that entirely.
 *
 * **Why this can't be "just cascade the User row and be done" — the
 * explicit gap this batch closes.** Every entity a User owns already
 * cascades at the database level when the `users` row is deleted
 * (`ApplicantProfile`, `ApplicationJourney` → `Application` → `Requirement`/
 * `Task`/`Deadline`/`ApplicationDocument`/`ApplicationSnapshot`, `Document`,
 * `RefreshSession`, `EmailVerificationOtp`, `PasswordResetToken` — every one
 * of them is `onDelete: 'CASCADE'` on its `user_id`/`application_id`/
 * `journey_id` FK). A plain `usersRepository.delete(userId)` would
 * therefore genuinely remove every database row. **It would not touch a
 * single Cloudinary asset** — those live entirely outside Postgres, and no
 * database-level cascade can reach them. Relying on DB cascade alone here
 * would silently leave every one of the account's uploaded documents
 * (potentially identity-adjacent files — passports, transcripts) live and
 * retrievable-by-signed-URL forever, with nothing left in the database to
 * even know they exist anymore. This service exists specifically to close
 * that gap.
 *
 * **Deletion order, and why it's not arbitrary**: `Document.previousVersionId`
 * is `onDelete: 'RESTRICT'` (Track 1 Group D, D-P2 — deliberately, so a
 * version chain's DB-level integrity can never silently break) and
 * `ApplicationDocument.documentId` is likewise `RESTRICT` (an attached
 * document must be detached before deletion). Both would reject a delete
 * issued in the wrong order. So, inside one transaction:
 *   1. Read this user's Document rows first — id + Cloudinary identity,
 *      ordered `version DESC` (a document is always a higher version number
 *      than the one it points to via `previousVersionId`, so deleting in
 *      this order never tries to delete a row something else still
 *      references).
 *   2. Delete every `ApplicationJourney` the user owns. This cascades away
 *      every `Application` and everything scoped to one (including
 *      `ApplicationDocument`) — clearing the RESTRICT that would otherwise
 *      block step 3 for any of this user's *attached* documents.
 *   3. Delete the user's `Document` rows, in the order read in step 1.
 *   4. Delete the `User` row itself — by now nothing but `ApplicantProfile`/
 *      `RefreshSession`/OTP/reset-token rows are left to cascade, none of
 *      them RESTRICT-constrained.
 * Only after that transaction COMMITS does this service attempt the
 * Cloudinary deletes (an external, non-transactional call) — same ordering
 * principle used everywhere else in this codebase (DB truth first, external
 * side effect after). A Cloudinary delete failure is logged per-asset (never
 * aborts the rest) — the account is already gone from the database at that
 * point regardless; an orphaned Cloudinary asset here is a cleanup task, not
 * a correctness problem, same reasoning as `DocumentsService`'s existing
 * orphan-handling (see `decisions.md`).
 */
@Injectable()
export class AccountErasureService {
  private readonly logger = new Logger(AccountErasureService.name);

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(ApplicationJourney)
    private readonly journeys: Repository<ApplicationJourney>,
    @InjectRepository(Document)
    private readonly documents: Repository<Document>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  private resolveResourceType(
    document: Pick<Document, 'cloudinaryResourceType' | 'mimeType'>,
  ): 'image' | 'raw' | 'video' {
    if (document.cloudinaryResourceType === 'image') return 'image';
    if (document.cloudinaryResourceType === 'video') return 'video';
    if (document.cloudinaryResourceType === 'raw') return 'raw';
    return document.mimeType?.startsWith('image/') ? 'image' : 'raw';
  }

  async eraseAccount(userId: string): Promise<void> {
    const documentsToClean: {
      publicId: string;
      resourceType: 'image' | 'raw' | 'video';
    }[] = await this.users.manager.transaction(async (manager) => {
      const ownedDocuments = await manager.find(Document, {
        where: { ownerId: userId },
        order: { version: 'DESC' },
      });

      await manager.delete(ApplicationJourney, { userId });

      for (const document of ownedDocuments) {
        await manager.delete(Document, document.id);
      }

      await manager.delete(User, userId);

      return ownedDocuments.map((document) => ({
        publicId: document.cloudinaryPublicId,
        resourceType: this.resolveResourceType(document),
      }));
    });

    const results = await Promise.allSettled(
      documentsToClean.map(({ publicId, resourceType }) =>
        this.cloudinaryService.deleteByPublicId(publicId, resourceType),
      ),
    );

    const failures = results.filter((r) => r.status === 'rejected').length;
    if (failures > 0) {
      this.logger.error(
        `Account erasure for user ${userId}: ${failures} of ` +
          `${documentsToClean.length} Cloudinary asset(s) failed to delete ` +
          `after the database rows were already removed. Manual cleanup may ` +
          `be required.`,
      );
    }
  }
}
