import { ApplicationStatus, ApplicationType } from '../../types';
import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { ApplicationJourney } from '../../journeys/entities/application-journey.entity';
import { Opportunity } from '../../opportunities/entities/opportunity.entity';
import { Requirement } from '../../requirements/entities/requirement.entity';
import { Task } from '../../tasks/entities/task.entity';
import { Deadline } from '../../deadlines/entities/deadline.entity';
import { ApplicationDocument } from './application-document.entity';
import { ApplicationSnapshot } from './application-snapshot.entity';

/**
 * One concrete application process (spec §12) — e.g. "University Twente
 * Scholarship Application" — belonging to exactly one ApplicationJourney.
 */
@Entity('applications')
export class Application extends BaseEntity {
  @ManyToOne(() => ApplicationJourney, (journey) => journey.applications, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'journey_id' })
  journey: ApplicationJourney;

  @Index()
  @Column({ type: 'uuid', name: 'journey_id' })
  journeyId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({
    type: 'enum',
    enum: ApplicationType,
    name: 'application_type',
    default: ApplicationType.OTHER,
  })
  applicationType: ApplicationType;

  @Column({
    type: 'enum',
    enum: ApplicationStatus,
    default: ApplicationStatus.NOT_STARTED,
  })
  status: ApplicationStatus;

  /** Optional link to the structured Opportunity this application pursues. */
  @ManyToOne(() => Opportunity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'opportunity_id' })
  opportunity: Opportunity | null;

  @Index()
  @Column({ type: 'uuid', name: 'opportunity_id', nullable: true })
  opportunityId: string | null;

  @Column({ type: 'date', nullable: true, name: 'start_date' })
  startDate: string | null;

  @Column({ type: 'date', nullable: true, name: 'submission_date' })
  submissionDate: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  portal: string | null;

  @Column({
    type: 'varchar',
    length: 1024,
    nullable: true,
    name: 'external_url',
  })
  externalUrl: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => Requirement, (requirement) => requirement.application)
  requirements?: Requirement[];

  @OneToMany(() => Task, (task) => task.application)
  tasks?: Task[];

  @OneToMany(() => Deadline, (deadline) => deadline.application)
  deadlines?: Deadline[];

  @OneToMany(() => ApplicationDocument, (link) => link.application)
  applicationDocuments?: ApplicationDocument[];

  @OneToMany(() => ApplicationSnapshot, (snapshot) => snapshot.application)
  snapshots?: ApplicationSnapshot[];

  /**
   * Production hardening (Batch 7) — soft-delete, deliberately scoped to
   * Application ONLY, not a blanket pattern applied to every entity in this
   * codebase. Application is the one entity in the domain model where an
   * accidental or reconsidered deletion has real, hard-to-reconstruct cost:
   * a real Application can carry a submission history worth preserving
   * through a grace period — Requirements, Tasks, Deadlines, attached
   * Document versions, and (Track 1 Group D's) point-in-time
   * ApplicationSnapshots, exactly the "historical accuracy" data this
   * domain model already treats as significant elsewhere. Everything else
   * that supports delete (Universities/Programmes/Opportunities catalog
   * rows, Documents, Tasks, Requirements, Deadlines) stays hard-delete —
   * those are either shared catalog data with no per-user "undo" need, or
   * (Documents) already have their own dedicated version-history model
   * serving the same "don't lose history" goal a different way.
   *
   * TypeORM's `@DeleteDateColumn` makes `repository.find()`/`findOne()`
   * automatically exclude a soft-deleted row (`deletedAt IS NULL`) with no
   * per-call opt-in — the safer default, since forgetting to add a filter
   * is the actual production risk this exists to close. Query-builder-based
   * reads (`ApplicationsService.findAllForUser()`'s keyset pagination) are
   * NOT covered by that automatic behavior and filter explicitly instead —
   * see that method.
   *
   * A soft-deleted Application is purged (hard-deleted, cascading exactly
   * as a direct hard delete always did) after
   * `applications.softDeleteRetentionDays` by `ApplicationPurgeService` —
   * see docs/decisions.md, "Batch 7 — Application soft-delete". Owner-only
   * restore (`POST /applications/:id/restore`) clears `deletedAt` while the
   * row still exists; after purge the application is permanently gone (404).
   */
  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at' })
  deletedAt: Date | null;
}
