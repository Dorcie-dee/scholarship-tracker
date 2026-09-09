import { ApplicationStatus, ApplicationType } from '../../types';
import {
  Column,
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
}
