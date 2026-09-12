import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { SnapshotCreatedVia } from '../../types';
import { BaseEntity } from '../../common/entities/base.entity';
import { Application } from './application.entity';

/**
 * Preserves what was true/used for a particular Application at a point in time
 * (spec §21) — the counterpart to the Master Profile (ApplicantProfile).
 *
 * Creation is ALWAYS an explicit user action — see `createdVia` and
 * docs/decisions.md ("Application Snapshot creation model"). Edits are
 * append-only: a new row is created with `supersedesSnapshotId` pointing at
 * the previous revision; historical rows are never mutated in place.
 *
 * `data` is a jsonb blob rather than a fully normalized structure because a
 * snapshot is fundamentally a point-in-time copy — normalizing it would let it
 * drift back into "live" data by accident, defeating its purpose.
 */
@Entity('application_snapshots')
export class ApplicationSnapshot extends BaseEntity {
  @ManyToOne(() => Application, (application) => application.snapshots, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'application_id' })
  application: Application;

  @Index()
  @Column({ type: 'uuid', name: 'application_id' })
  applicationId: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'label' })
  label: string | null;

  /**
   * MANUAL = the user explicitly chose "Create Snapshot". SUGGESTED = a future
   * suggestion was explicitly accepted by the user. Never set automatically —
   * see the class doc comment. Currently only MANUAL is ever written; nothing
   * in this phase implements the suggestion layer.
   */
  @Column({
    type: 'enum',
    enum: SnapshotCreatedVia,
    name: 'created_via',
    default: SnapshotCreatedVia.MANUAL,
  })
  createdVia: SnapshotCreatedVia;

  /**
   * Point-in-time copy: relevant application facts, relevant profile fields,
   * relevant requirement state (including, since Track 1 Group D,
   * `requirementId` and the Group C `copiedFromRequirementId` provenance
   * breadcrumb — a copy of that value, never a live resolution of the source
   * row), exact attached-document references (by documentId + version —
   * never a copy of the file), and written responses (currently always an
   * empty array — no storage model for written-response text exists yet in
   * this codebase; see application-snapshots.service.ts).
   *
   * See docs/decisions.md, "Application Snapshot creation model" for the
   * full creation-model rationale (manual-only creation, immutability, and
   * why Application deletion is allowed to cascade-destroy snapshots while
   * ordinary mutation never is).
   */
  @Column({ type: 'jsonb' })
  data: Record<string, unknown>;

  /**
   * Append-only edit lineage: when a user "edits" a snapshot, a NEW row is
   * created whose `supersedesSnapshotId` points at the previous revision.
   * The previous row is never mutated. Null for the first revision in a chain.
   */
  @ManyToOne(() => ApplicationSnapshot, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'supersedes_snapshot_id' })
  supersedesSnapshot: ApplicationSnapshot | null;

  @Index()
  @Column({ type: 'uuid', name: 'supersedes_snapshot_id', nullable: true })
  supersedesSnapshotId: string | null;
}
