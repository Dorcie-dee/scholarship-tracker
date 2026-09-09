import { TaskDependencyType, TaskPriority, TaskStatus } from '../../types';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Application } from '../../applications/entities/application.entity';
import { ApplicationJourney } from '../../journeys/entities/application-journey.entity';
import { Requirement } from '../../requirements/entities/requirement.entity';

/**
 * An action the user needs to perform (spec §17).
 *
 * `dependsOnTaskId`/`dependencyType` encode the spec's hard/soft dependency
 * concept (spec §18): PURELY INFORMATIONAL. No service in this codebase reads
 * these fields to block a write — they exist only so the API/UI can surface a
 * recommendation ("this normally comes after X"). Enforcing this is a code
 * review concern, not a schema concern: see docs/decisions.md, "Dependencies
 * never block the user", and tasks.service.ts's tests.
 */
@Entity('tasks')
export class Task extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: TaskStatus, default: TaskStatus.TODO })
  status: TaskStatus;

  @Column({ type: 'enum', enum: TaskPriority, default: TaskPriority.MEDIUM })
  priority: TaskPriority;

  @Column({ type: 'date', nullable: true, name: 'due_date' })
  dueDate: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'completed_at' })
  completedAt: Date | null;

  @ManyToOne(() => Application, (application) => application.tasks, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'application_id' })
  application: Application | null;

  @Index()
  @Column({ type: 'uuid', name: 'application_id', nullable: true })
  applicationId: string | null;

  /**
   * NOT NULL (Track 1 Group C, C1.1) — every task genuinely has a journey by
   * the time it reaches this column; CreateTaskDto has always required it and
   * TasksService.findWithJourneyOrThrow() had to defensively guard against a
   * missing one, meaning the schema wasn't actually backing the invariant
   * every code path already assumed. Confirmed zero existing NULL rows
   * before migrating (see the migration file's own verification).
   */
  @ManyToOne(() => ApplicationJourney, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'journey_id' })
  journey: ApplicationJourney;

  @Index()
  @Column({ type: 'uuid', name: 'journey_id' })
  journeyId: string;

  @ManyToOne(() => Requirement, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'requirement_id' })
  requirement: Requirement | null;

  @Index()
  @Column({ type: 'uuid', name: 'requirement_id', nullable: true })
  requirementId: string | null;

  /** Informational only — see class doc comment. Never enforced. */
  @ManyToOne(() => Task, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'depends_on_task_id' })
  dependsOnTask: Task | null;

  @Column({ type: 'uuid', name: 'depends_on_task_id', nullable: true })
  dependsOnTaskId: string | null;

  @Column({
    type: 'enum',
    enum: TaskDependencyType,
    name: 'dependency_type',
    nullable: true,
  })
  dependencyType: TaskDependencyType | null;
}
