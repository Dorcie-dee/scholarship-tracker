import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * The "Master Profile" (spec §22): reusable applicant information that is NOT
 * duplicated into every Application. Applications instead capture an
 * ApplicationSnapshot of the relevant parts of this profile at submission time
 * (spec §21) — updating this profile must never rewrite history.
 *
 * V1 keeps education/experience/skills/etc. as loosely-structured JSON arrays
 * rather than fully normalized child tables. This is intentional: the spec
 * explicitly asks us not to over-model the profile before the core Application
 * Journey flow is proven (see docs/decisions.md).
 */
@Entity('applicant_profiles')
export class ApplicantProfile extends BaseEntity {
  @OneToOne(() => User, (user) => user.profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  nationality: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'date_of_birth',
  })
  dateOfBirth: string | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  /** Array of { institution, degree, field, startDate, endDate, gpa? } */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  education: Record<string, unknown>[];

  /** Array of { organisation, role, startDate, endDate, description? } */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  experience: Record<string, unknown>[];

  /** Array of plain skill strings or { name, level? } objects. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  skills: Record<string, unknown>[];

  /** Array of { name, issuer, date? } */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  certifications: Record<string, unknown>[];

  /** Array of { language, proficiency, testType?, score? } */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  languages: Record<string, unknown>[];

  /** Escape hatch for anything not yet modeled explicitly (spec's "Other"). */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;
}
