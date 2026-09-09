import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { SnapshotCreatedVia } from '../../types';
import { BaseEntity } from '../../common/entities/base.entity';
import { Application } from './application.entity';

/**
 * Preserves what was true/used for a particular Application at a point in time
 * (spec §21) — the counterpart to the Master Profile (ApplicantProfile).
 *
 * Creation is ALWAYS an explicit user action — see `createdVia` and
 * docs/decisions.md ("Application Snapshot creation model"). Nothing in this
 * codebase creates a snapshot automatically (not on status change, not on
 * submission, not on a document change) — a future intelligent layer may
 * SUGGEST creating one based on signals, but the suggestion never creates the
 * row itself; only an explicit user decision does. Once created, a snapshot is
 * never mutated — see application-snapshots.service.ts, which deliberately has
 * no update()/remove() method; subsequent changes to the master profile or
 * documents must never alter an existing snapshot.
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
}
