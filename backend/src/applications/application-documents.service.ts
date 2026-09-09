import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ApplicationDocument } from './entities/application-document.entity';
import { ApplicationsService } from './applications.service';
import { DocumentsService } from '../documents/documents.service';
import { AttachDocumentDto } from './dto/attach-document.dto';

/**
 * Name of the unique constraint on (application_id, document_id), created by
 * migration 1788080105496-AddApplicationDocumentUniqueConstraint.ts. Checking
 * the constraint name (not just the Postgres error code) means a *different*
 * unique-violation on the same statement can't be mistaken for "this document
 * is already attached to this application" — see documents/pg-protocol's
 * DatabaseError.constraint, which TypeORM's QueryFailedError copies onto
 * itself (same mechanism verified for UsersService in Checkpoint 7).
 */
const APPLICATION_DOCUMENT_UNIQUE_CONSTRAINT = 'UQ_7f837e4e352186f29746f428de4';
const POSTGRES_UNIQUE_VIOLATION = '23505';

/**
 * Pins an EXACT Document version to an Application (spec §20). Deliberately
 * does not restrict how many documents — or how many of the same
 * `documentType` — an application can have attached; `label` is how the user
 * tells multiple attachments apart, not a type-based cap. See
 * docs/decisions.md.
 */
@Injectable()
export class ApplicationDocumentsService {
  constructor(
    @InjectRepository(ApplicationDocument)
    private readonly applicationDocuments: Repository<ApplicationDocument>,
    private readonly applicationsService: ApplicationsService,
    private readonly documentsService: DocumentsService,
  ) {}

  /**
   * Attaches an existing Document version to an Application. Both ownership
   * checks are scoped to the SAME caller (`userId`), so a user can only
   * attach their own documents to their own applications — there's no path
   * to attach someone else's document, or attach to someone else's
   * application, even by guessing a valid id.
   *
   * The two ownership/existence checks are independent of each other's
   * result, so they run concurrently (same pattern as Checkpoint 5).
   * Duplicate attachment is guarded by the database constraint alone — no
   * upfront existence check — per the approved design: a pre-check would add
   * a round trip to the normal path and still not close the race window a
   * unique constraint closes for free.
   */
  async attach(
    userId: string,
    applicationId: string,
    dto: AttachDocumentDto,
  ): Promise<ApplicationDocument> {
    const [, document] = await Promise.all([
      this.applicationsService.findOwnedOrThrow(applicationId, userId),
      this.documentsService.findOwnedOrThrow(dto.documentId, userId),
    ]);

    const link = this.applicationDocuments.create({
      applicationId,
      documentId: document.id,
      // Already have the full Document in hand from the ownership check
      // above — attach it directly so the caller gets the exact version's
      // details back without a second query.
      document,
      label: dto.label ?? null,
      attachedAt: new Date(),
    });

    try {
      return await this.applicationDocuments.save(link);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as unknown as { code?: string }).code ===
          POSTGRES_UNIQUE_VIOLATION &&
        (error as unknown as { constraint?: string }).constraint ===
          APPLICATION_DOCUMENT_UNIQUE_CONSTRAINT
      ) {
        throw new ConflictException(
          'This exact document version is already attached to this application',
        );
      }
      throw error;
    }
  }

  /**
   * Lists an application's attached documents with their exact pinned
   * versions. Two queries: the ownership check, then one joined `find()` —
   * see docs/decisions.md for why this isn't collapsed into a single query
   * (a combined query can't distinguish "not yours"/"doesn't exist" from
   * "yours, but nothing attached yet", which is the common case for a
   * freshly-created application).
   */
  async findAllForApplication(
    userId: string,
    applicationId: string,
  ): Promise<ApplicationDocument[]> {
    await this.applicationsService.findOwnedOrThrow(applicationId, userId);

    return this.applicationDocuments.find({
      where: { applicationId },
      relations: { document: true },
      order: { attachedAt: 'ASC' },
    });
  }

  /**
   * Track 1 Group D (D-P4) — removes ONE attachment (the join row only).
   * This is a working-state cleanup operation, not a document-deletion
   * operation: it never touches the underlying Document row, never touches
   * Cloudinary, and never touches any existing ApplicationSnapshot — a
   * snapshot's `data.documents[]` is a point-in-time copy made at snapshot-
   * creation time (see application-snapshots.service.ts), entirely
   * independent of whatever is or isn't currently attached. A snapshot taken
   * AFTER this detach will naturally reflect the new (smaller) set of
   * attachments; a snapshot taken BEFORE it is completely unaffected.
   *
   * Identified by `documentId`, not the ApplicationDocument row's own `id` —
   * deliberately: `documentId` is exactly what the attach endpoint's request
   * body already uses, and `UNIQUE(applicationId, documentId)` guarantees at
   * most one attachment row can ever match a given (applicationId,
   * documentId) pair, so there is no ambiguity in identifying "the"
   * attachment this way. Only Application ownership is (re-)checked here —
   * the Document's own ownership was already verified at attach() time, and
   * the row being deleted is inherently scoped to an Application the caller
   * already owns.
   */
  async detach(
    userId: string,
    applicationId: string,
    documentId: string,
  ): Promise<void> {
    await this.applicationsService.findOwnedOrThrow(applicationId, userId);

    const link = await this.applicationDocuments.findOne({
      where: { applicationId, documentId },
    });
    if (!link) {
      throw new NotFoundException(
        'This document is not attached to this application',
      );
    }

    await this.applicationDocuments.delete(link.id);
  }
}
