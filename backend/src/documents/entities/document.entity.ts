import { DocumentType } from '../../types';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * A single version of a user's document (spec §19/§20). Uploading a new
 * version of e.g. a CV creates a NEW row with `version` incremented and
 * `previousVersionId` pointing at the row it supersedes — it never mutates the
 * previous row. This is what lets ApplicationDocument (see
 * application-document.entity.ts) keep pointing at the exact version that was
 * actually used for a historical application even after the user's "current"
 * CV moves on to v3, v4, etc.
 */
@Entity('documents')
export class Document extends BaseEntity {
  @ManyToOne(() => User, (user) => user.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Index()
  @Column({ type: 'uuid', name: 'owner_id' })
  ownerId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({
    type: 'enum',
    enum: DocumentType,
    name: 'document_type',
    default: DocumentType.OTHER,
  })
  documentType: DocumentType;

  @Column({ type: 'int', default: 1 })
  version: number;

  /**
   * Self-reference to the version this one supersedes. Null for a document's
   * first version. Following this chain reconstructs full version history.
   *
   * Track 1 Group D (D-P2) — `onDelete: 'RESTRICT'`, not `SET NULL`. A `SET
   * NULL` here would let deleting an ancestor version silently truncate the
   * chain for whichever later version pointed at it — `findVersionHistory()`
   * would just quietly stop one hop early, with no error to anyone. RESTRICT
   * means the database itself refuses to delete a version that a newer
   * version still depends on, same protective pattern already used for
   * `ApplicationDocument.document` (see application-document.entity.ts).
   * `DocumentsService.remove()` also checks this explicitly up front (see its
   * doc comment) so the rejection is a clean 409, not a raw FK-violation 500
   * — the DB constraint is defense-in-depth, not the only line of defense.
   */
  @ManyToOne(() => Document, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'previous_version_id' })
  previousVersion: Document | null;

  @Column({ type: 'uuid', name: 'previous_version_id', nullable: true })
  previousVersionId: string | null;

  @Column({ type: 'varchar', length: 255, name: 'cloudinary_public_id' })
  cloudinaryPublicId: string;

  @Column({ type: 'varchar', length: 1024, name: 'cloudinary_url' })
  cloudinaryUrl: string;

  /**
   * Production hardening (Batch 6) — Cloudinary's own `resource_type`
   * ('image' | 'raw' | 'video'), captured exactly as Cloudinary reported it
   * at upload time (via `resource_type: 'auto'` detection). Required to
   * generate a correct signed delivery URL or issue a correct delete call
   * later — both must specify the exact resource type an asset was actually
   * stored under, and inferring it from `mimeType` risks a mismatch
   * Cloudinary itself already resolved unambiguously at upload time.
   * Nullable only for rows written before this column existed.
   */
  @Column({
    type: 'varchar',
    length: 32,
    name: 'cloudinary_resource_type',
    nullable: true,
  })
  cloudinaryResourceType: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'mime_type' })
  mimeType: string | null;

  @Column({ type: 'int', nullable: true, name: 'file_size_bytes' })
  fileSizeBytes: number | null;

  @Column({ type: 'boolean', default: true, name: 'is_current' })
  isCurrent: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
