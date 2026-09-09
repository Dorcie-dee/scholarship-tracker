import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Document } from './entities/document.entity';
import { ApplicationDocument } from '../applications/entities/application-document.entity';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';
import { assertOwnership } from '../common/utils/ownership';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectRepository(Document)
    private readonly documents: Repository<Document>,
    // Injected directly (not via ApplicationDocumentsService) to avoid a
    // circular module dependency — ApplicationsModule already imports
    // DocumentsModule (ApplicationDocumentsService depends on
    // DocumentsService) — same reasoning already established elsewhere in
    // this codebase (ApplicationsService injecting Requirement directly,
    // ApplicationSnapshotsService injecting ApplicationDocument/Requirement
    // directly). Track 1 Group D (D-P1/D-P2): used only to check whether a
    // Document version is currently attached before allowing its deletion —
    // never to read or mutate application data otherwise. (The parallel
    // check against ApplicationSnapshot — see isReferencedInAnySnapshot() —
    // goes through a raw query on `this.documents.manager` instead, since it
    // needs to join across three tables; no ApplicationSnapshot repository
    // injection is needed for that.)
    @InjectRepository(ApplicationDocument)
    private readonly applicationDocuments: Repository<ApplicationDocument>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async uploadNew(
    ownerId: string,
    dto: CreateDocumentDto,
    file: Express.Multer.File,
  ): Promise<Document> {
    const uploaded = await this.cloudinaryService.uploadBuffer(file.buffer, {
      folder: `scholarship-os/${ownerId}/documents`,
      filename: file.originalname,
    });

    const document = this.documents.create({
      ownerId,
      title: dto.title,
      documentType: dto.documentType,
      notes: dto.notes ?? null,
      version: 1,
      previousVersionId: null,
      cloudinaryPublicId: uploaded.publicId,
      cloudinaryUrl: uploaded.secureUrl,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
      isCurrent: true,
    });
    return this.documents.save(document);
  }

  /**
   * Uploads a new version of an existing document. The previous version row is
   * kept as-is (marked `isCurrent: false`) — never mutated or deleted — so any
   * ApplicationDocument still pointing at it keeps working. See
   * document.entity.ts's doc comment.
   *
   * The Cloudinary upload happens BEFORE the transaction starts (same
   * reasoning as ever: an external, non-transactional network call). A cheap
   * ownership check also happens up front, so an obviously-invalid call fails
   * before wasting an upload.
   *
   * Track 1 Group D (D1) — race fix: the version-determining read now
   * happens INSIDE the transaction, against a row locked with
   * `SELECT ... FOR UPDATE` (via `setLock('pessimistic_write')`), and the
   * locked row's `isCurrent` flag is re-checked before proceeding. Two
   * concurrent calls both targeting the same parent document id used to both
   * read `previous.version = N` before either committed, and both compute
   * `version: N + 1` — producing two sibling rows with the same version
   * number, both `isCurrent: true`. Now: the second call blocks on the row
   * lock until the first commits; once unblocked, Postgres re-fetches the
   * row's latest COMMITTED state (confirmed behavior for `SELECT ... FOR
   * UPDATE` under READ COMMITTED, this connection's isolation level) — so the
   * second call sees `isCurrent: false` (the first call already flipped it)
   * and is rejected with a clean `ConflictException` instead of silently
   * creating a duplicate-numbered sibling. A row lock is sufficient here —
   * no advisory lock is needed, since the invariant being protected
   * ("only the current version's row may be superseded") lives entirely on
   * this one row.
   */
  async uploadNewVersion(
    ownerId: string,
    documentId: string,
    file: Express.Multer.File,
    dto: Partial<CreateDocumentDto>,
  ): Promise<Document> {
    // Fast-fail ownership check before the expensive external upload call.
    await this.findOwnedOrThrow(documentId, ownerId);

    const uploaded = await this.cloudinaryService.uploadBuffer(file.buffer, {
      folder: `scholarship-os/${ownerId}/documents`,
      filename: file.originalname,
    });

    return this.documents.manager.transaction(async (manager) => {
      const locked = await manager
        .createQueryBuilder(Document, 'document')
        .setLock('pessimistic_write')
        .where('document.id = :id', { id: documentId })
        .getOne();
      if (!locked) {
        throw new NotFoundException('Document not found');
      }
      // Re-verified against the freshly-locked row, not the pre-lock read
      // above — cheap, and correct defense-in-depth.
      assertOwnership(locked.ownerId, ownerId);

      if (!locked.isCurrent) {
        throw new ConflictException(
          'This document has already been superseded by a newer version — refresh and try again',
        );
      }

      await manager.update(Document, locked.id, { isCurrent: false });
      const next = manager.create(Document, {
        ownerId,
        title: dto.title ?? locked.title,
        documentType: dto.documentType ?? locked.documentType,
        notes: dto.notes ?? locked.notes,
        version: locked.version + 1,
        previousVersionId: locked.id,
        cloudinaryPublicId: uploaded.publicId,
        cloudinaryUrl: uploaded.secureUrl,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        isCurrent: true,
      });
      return manager.save(next);
    });
  }

  /** Lists only the current version of each of the user's documents. */
  findAllCurrentForUser(ownerId: string): Promise<Document[]> {
    return this.documents.find({
      where: { ownerId, isCurrent: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Full version history for one logical document, oldest first.
   *
   * Walks the `previousVersionId` chain server-side via a recursive CTE (one
   * query) instead of one query per hop, then hydrates real Document entities
   * via a single `find(... In(ids))` call — 3 queries total regardless of how
   * long the chain is, instead of `1 + N`. Deliberately not a single fully-raw
   * query (would require hand-mapping every Document column from snake_case,
   * a maintenance burden for one saved round trip) nor a denormalized
   * "document group id" column (a schema change, out of scope here).
   */
  async findVersionHistory(
    ownerId: string,
    documentId: string,
  ): Promise<Document[]> {
    await this.findOwnedOrThrow(documentId, ownerId);

    const chain: { id: string }[] = await this.documents.manager.query(
      `WITH RECURSIVE version_chain AS (
         SELECT id, previous_version_id FROM documents WHERE id = $1
         UNION ALL
         SELECT d.id, d.previous_version_id
         FROM documents d
         INNER JOIN version_chain vc ON d.id = vc.previous_version_id
       )
       SELECT id FROM version_chain`,
      [documentId],
    );

    const ids = chain.map((row) => row.id);
    const rows = await this.documents.find({ where: { id: In(ids) } });

    // find(... In(ids)) doesn't guarantee result order matches `ids` — the CTE
    // returns newest-first, so re-sort explicitly and reverse to oldest-first.
    const byId = new Map(rows.map((doc) => [doc.id, doc]));
    return ids
      .map((id) => byId.get(id))
      .filter((doc): doc is Document => Boolean(doc))
      .reverse();
  }

  private async findEntityOrThrow(id: string): Promise<Document> {
    const document = await this.documents.findOne({ where: { id } });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    return document;
  }

  async findOwnedOrThrow(id: string, ownerId: string): Promise<Document> {
    const document = await this.findEntityOrThrow(id);
    assertOwnership(document.ownerId, ownerId);
    return document;
  }

  async update(
    id: string,
    ownerId: string,
    dto: UpdateDocumentDto,
  ): Promise<Document> {
    const document = await this.findOwnedOrThrow(id, ownerId);
    Object.assign(document, dto);
    return this.documents.save(document);
  }

  /**
   * Whether `documentId` appears in ANY of this owner's existing snapshots'
   * `data.documents[]` array — a targeted PostgreSQL JSONB containment query
   * (`@>`), not a full table scan into application memory. Scoped by owner
   * (joined all the way through Application -> ApplicationJourney -> userId)
   * so this can never be used to probe another user's snapshot contents —
   * confirmed correct against real Postgres containment semantics before
   * relying on it here: `'[{"documentId":"x","version":2}]'::jsonb @>
   * '[{"documentId":"x"}]'::jsonb` is `true` (object containment inside an
   * array element matches on a SUBSET of keys), and correctly `false` for a
   * non-matching documentId.
   *
   * Track 1 Group D (D-P1/D4) — closes the exact gap the Group D inspection
   * found: `application_documents.document_id`'s `ON DELETE RESTRICT` only
   * protects a version that's CURRENTLY attached; a version that was
   * attached at snapshot-creation time but has since been detached (see
   * ApplicationDocumentsService.detach()) has no FK protecting it at all,
   * since jsonb columns can't carry a real foreign key. This check applies
   * regardless of current attachment state.
   */
  private async isReferencedInAnySnapshot(
    documentId: string,
    ownerId: string,
  ): Promise<boolean> {
    const rows: { exists: boolean }[] = await this.documents.manager.query(
      `SELECT EXISTS (
         SELECT 1
         FROM application_snapshots s
         INNER JOIN applications a ON a.id = s.application_id
         INNER JOIN application_journeys j ON j.id = a.journey_id
         WHERE j.user_id = $1
           AND s.data -> 'documents' @> $2::jsonb
       ) AS "exists"`,
      [ownerId, JSON.stringify([{ documentId }])],
    );
    return rows[0]?.exists ?? false;
  }

  /**
   * Deletes one Document version. Track 1 Group D (D-P1, D-P2, D-P3, D-P7) —
   * rewritten in full; the previous implementation deleted the Cloudinary
   * asset BEFORE attempting the DB delete, which could (and, for any
   * currently-attached document, deterministically would) destroy the real
   * file even though the DB then rejected the row delete via
   * `ON DELETE RESTRICT` — an unrecoverable, silent historical-integrity
   * break surfaced only as a generic 500. The invariant now is: **never
   * touch Cloudinary until Postgres has confirmed the row can be deleted.**
   *
   * Order of operations:
   * 1. Ownership check.
   * 2. Three explicit eligibility checks, each producing a clean 409 (not a
   *    raw FK-violation 500) — currently attached, referenced by a snapshot,
   *    or depended on by a newer version. Each also has a DB-level backstop
   *    (`ON DELETE RESTRICT` on both the relevant FKs) — these checks are
   *    defense-in-depth, not the only protection, consistent with this
   *    codebase's established double-layer pattern (e.g. Requirement/
   *    Deadline's "at least one parent" CHECK constraint).
   * 3. Delete the DB row (in a transaction alongside the current-version
   *    promotion, if applicable — see below).
   * 4. Only now, attempt the Cloudinary delete. A failure here is logged
   *    (orphaned asset, flagged for operational follow-up) but never
   *    reverses the already-committed DB deletion — Postgres and Cloudinary
   *    cannot share one transaction, and re-inserting a "deleted" row to
   *    compensate would just reintroduce the exact inconsistency this fix
   *    removes.
   *
   * Current-version handling (D-P3): if the version being deleted is the
   * current one and a previous version exists, that previous version is
   * promoted to `isCurrent: true` in the SAME transaction as the delete, so
   * the family never has zero current rows. If there is no previous version
   * (this was the sole version), deleting it removes the entire document
   * family — there is no "empty current state" to worry about, since no rows
   * remain for that family at all.
   */
  async remove(id: string, ownerId: string): Promise<void> {
    const document = await this.findOwnedOrThrow(id, ownerId);

    // The three eligibility checks are independent of each other's result,
    // so they run concurrently — same established pattern as every other
    // multi-check validation in this codebase (Track 1 Group A Checkpoint 5,
    // reused throughout Groups B/C).
    const [attachedElsewhere, referencedInSnapshot, dependentChild] =
      await Promise.all([
        this.applicationDocuments.findOne({ where: { documentId: id } }),
        this.isReferencedInAnySnapshot(id, ownerId),
        this.documents.findOne({ where: { previousVersionId: id } }),
      ]);

    if (attachedElsewhere) {
      throw new ConflictException(
        'Cannot delete a document version that is currently attached to an application — detach it first',
      );
    }
    if (referencedInSnapshot) {
      throw new ConflictException(
        'Cannot delete a document version that is referenced by an existing application snapshot',
      );
    }
    if (dependentChild) {
      throw new ConflictException(
        'Cannot delete a document version that a newer version depends on',
      );
    }

    const wasCurrent = document.isCurrent;
    const previousVersionId = document.previousVersionId;

    await this.documents.manager.transaction(async (manager) => {
      await manager.delete(Document, id);
      if (wasCurrent && previousVersionId) {
        await manager.update(Document, previousVersionId, {
          isCurrent: true,
        });
      }
    });

    // Only now — after the DB deletion has committed — attempt the
    // irreversible Cloudinary delete. A failure here never undoes the DB
    // deletion above; it only leaves an orphaned Cloudinary asset, which is
    // logged for operational follow-up (see decisions.md).
    try {
      await this.cloudinaryService.deleteByPublicId(
        document.cloudinaryPublicId,
      );
    } catch (error) {
      this.logger.error(
        `Cloudinary asset orphaned after deleting Document ${id}: publicId=${document.cloudinaryPublicId}. ` +
          `The database row is gone; the Cloudinary asset was not. Manual cleanup may be required. ` +
          `Underlying error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
