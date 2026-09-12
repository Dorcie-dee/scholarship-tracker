import { OpportunityType, StudyLevel } from '../../types';
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
import { OpportunitySource } from '../../opportunity-sources/entities/opportunity-source.entity';
import { Requirement } from '../../requirements/entities/requirement.entity';
import { Deadline } from '../../deadlines/entities/deadline.entity';

/**
 * A scholarship, grant, fellowship, or other funding opportunity (spec §13).
 * Deliberately does not try to model every field every scholarship website
 * might publish — `metadata` is the escape hatch for anything not modeled
 * explicitly, per the spec's "Other" category.
 *
 * Production hardening (Batch 18, final scalability review) —
 * `(created_at, id)` composite index, same reasoning as `University`'s own
 * (see its doc comment): `OpportunitiesService.findAll()`'s default keyset
 * pagination sorts on exactly this pair, and Opportunity is this whole
 * product's central, shared, unscoped, and most likely to actually grow
 * large catalog table — the one place "database size grows 10x/100x"
 * concretely means "the opportunity catalog grows," not merely "the user
 * count grows" (which the owner-scoped tables already tolerate via their
 * existing FK indexes, bounding any one query to one user's own rows).
 */
@Entity('opportunities')
@Index(['createdAt', 'id'])
export class Opportunity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  provider: string | null;

  @Column({
    type: 'enum',
    enum: OpportunityType,
    name: 'opportunity_type',
    default: OpportunityType.SCHOLARSHIP,
  })
  opportunityType: OpportunityType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  country: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'funding_type',
  })
  fundingType: string | null;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    name: 'funding_amount',
  })
  fundingAmount: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  currency: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  duration: string | null;

  @Column({
    type: 'enum',
    enum: StudyLevel,
    name: 'study_level',
    nullable: true,
  })
  studyLevel: StudyLevel | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  field: string | null;

  @Column({ type: 'text', nullable: true, name: 'eligibility_summary' })
  eligibilitySummary: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'application_method',
  })
  applicationMethod: string | null;

  @Column({
    type: 'varchar',
    length: 1024,
    nullable: true,
    name: 'application_url',
  })
  applicationUrl: string | null;

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

  /** Catch-all for fields that don't fit the predefined schema (spec §13). */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @OneToMany(() => OpportunitySource, (source) => source.opportunity)
  sources?: OpportunitySource[];

  @OneToMany(() => Requirement, (requirement) => requirement.opportunity)
  requirements?: Requirement[];

  @OneToMany(() => Deadline, (deadline) => deadline.opportunity)
  deadlines?: Deadline[];
}
