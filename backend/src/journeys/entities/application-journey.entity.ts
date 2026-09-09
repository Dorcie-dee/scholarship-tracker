import { JourneyStatus } from '../../types';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { University } from '../../universities/entities/university.entity';
import { Programme } from '../../programmes/entities/programme.entity';
import { Application } from '../../applications/entities/application.entity';
import { User } from '../../users/entities/user.entity';

/**
 * The larger academic goal (spec §11), e.g. "MSc Computer Science — University
 * of Twente". Connects a University + Programme to the set of concrete
 * Applications (admission, scholarships, other funding) that together pursue
 * that goal.
 *
 * IMPORTANT: ApplicationJourney is NOT interchangeable with Application — see
 * docs/domain-model.md. Status is a free-form enum (not a rigid single
 * workflow) so future customization doesn't require a schema change.
 */
@Entity('application_journeys')
export class ApplicationJourney extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  owner: User;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  goal: string | null;

  @Column({
    type: 'enum',
    enum: JourneyStatus,
    default: JourneyStatus.PLANNING,
  })
  status: JourneyStatus;

  @ManyToOne(() => University, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'university_id' })
  university: University | null;

  @Index()
  @Column({ type: 'uuid', name: 'university_id', nullable: true })
  universityId: string | null;

  @ManyToOne(() => Programme, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'programme_id' })
  programme: Programme | null;

  @Index()
  @Column({ type: 'uuid', name: 'programme_id', nullable: true })
  programmeId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => Application, (application) => application.journey)
  applications?: Application[];
}
