import { StudyLevel } from '../../types';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { University } from '../../universities/entities/university.entity';

/**
 * Production hardening (Batch 18, final scalability review) — `(name, id)`
 * composite index, same reasoning as `University`'s own (see its doc
 * comment): `ProgrammesService.findAll()`'s default keyset pagination sorts
 * on exactly this pair, and — unlike `Opportunity`, whose `programmeId`
 * filter is effectively always used in practice — `universityId` here is
 * genuinely optional (`GET /programmes` with no filter at all lists across
 * every university), so this can't rely on the existing `university_id`
 * index alone to bound the row set the way a truly-always-scoped query
 * could.
 */
@Entity('programmes')
@Index(['name', 'id'])
export class Programme extends BaseEntity {
  @ManyToOne(() => University, (university) => university.programmes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'university_id' })
  university: University;

  @Index()
  @Column({ type: 'uuid', name: 'university_id' })
  universityId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({
    type: 'enum',
    enum: StudyLevel,
    name: 'study_level',
    nullable: true,
  })
  studyLevel: StudyLevel | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  field: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  duration: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  website: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
