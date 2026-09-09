import { DeadlineStatus, DeadlineType } from '../../types';
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Opportunity } from '../../opportunities/entities/opportunity.entity';
import { Application } from '../../applications/entities/application.entity';
import { Task } from '../../tasks/entities/task.entity';
import { Requirement } from '../../requirements/entities/requirement.entity';

/**
 * A flexible date/milestone (spec §16). An Opportunity or Application is never
 * assumed to have only one deadline — each Deadline row is one date, and any
 * number can attach to the same Opportunity/Application.
 *
 * All four association FKs are nullable and independent so a Deadline can be
 * scoped as broadly (an Opportunity's general deadline) or narrowly (a single
 * Task's due-adjacent milestone) as needed, without forcing every Deadline to
 * go through an Application.
 *
 * Group B / F5: same reasoning as Requirement's CHECK constraint — the
 * service layer already enforces "at least one of the four" on create(), this
 * is the DB-level backstop for any future write path that bypasses it.
 */
@Entity('deadlines')
@Check(
  `"opportunity_id" IS NOT NULL OR "application_id" IS NOT NULL OR "task_id" IS NOT NULL OR "requirement_id" IS NOT NULL`,
)
export class Deadline extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  label: string;

  @Column({
    type: 'enum',
    enum: DeadlineType,
    name: 'deadline_type',
    default: DeadlineType.OTHER,
  })
  deadlineType: DeadlineType;

  @Column({ type: 'timestamptz' })
  date: Date;

  @Column({
    type: 'enum',
    enum: DeadlineStatus,
    default: DeadlineStatus.UPCOMING,
  })
  status: DeadlineStatus;

  @ManyToOne(() => Opportunity, (opportunity) => opportunity.deadlines, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'opportunity_id' })
  opportunity: Opportunity | null;

  @Index()
  @Column({ type: 'uuid', name: 'opportunity_id', nullable: true })
  opportunityId: string | null;

  @ManyToOne(() => Application, (application) => application.deadlines, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'application_id' })
  application: Application | null;

  @Index()
  @Column({ type: 'uuid', name: 'application_id', nullable: true })
  applicationId: string | null;

  @ManyToOne(() => Task, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'task_id' })
  task: Task | null;

  @Index()
  @Column({ type: 'uuid', name: 'task_id', nullable: true })
  taskId: string | null;

  @ManyToOne(() => Requirement, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'requirement_id' })
  requirement: Requirement | null;

  @Index()
  @Column({ type: 'uuid', name: 'requirement_id', nullable: true })
  requirementId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
