import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Application } from './application.entity';
import { Document } from '../../documents/entities/document.entity';

/**
 * Join between an Application and the EXACT Document version attached to it
 * (spec §20). This row's `documentId` is fixed at attach time — if the user
 * later uploads CV v3, this row keeps pointing at v2 until someone explicitly
 * re-attaches a newer version. That is what guarantees historical applications
 * never silently change when the user's current documents do.
 *
 * The same exact document version cannot be attached to the same application
 * twice — enforced at the database level (race-safe by construction, not just
 * an application-level check) via the unique constraint below. Multiple
 * *different* documents of the same documentType (e.g. two CVs) ARE allowed —
 * `label` is how the user tells them apart, not a type-based restriction.
 */
@Entity('application_documents')
@Unique(['applicationId', 'documentId'])
export class ApplicationDocument extends BaseEntity {
  @ManyToOne(
    () => Application,
    (application) => application.applicationDocuments,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'application_id' })
  application: Application;

  @Index()
  @Column({ type: 'uuid', name: 'application_id' })
  applicationId: string;

  @ManyToOne(() => Document, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'document_id' })
  document: Document;

  @Index()
  @Column({ type: 'uuid', name: 'document_id' })
  documentId: string;

  /** e.g. "Statement of Purpose", "Transcript — Bachelor's" — role within this application. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  label: string | null;

  @Column({ type: 'timestamptz', name: 'attached_at' })
  attachedAt: Date;
}
