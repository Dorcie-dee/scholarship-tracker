import { Exclude } from 'class-transformer';
import { Column, Entity, Index, OneToMany, OneToOne } from 'typeorm';
import { UserRole } from '../../types';
import { BaseEntity } from '../../common/entities/base.entity';
import { RefreshSession } from '../../auth/entities/refresh-session.entity';
import { ApplicantProfile } from '../../profile/entities/applicant-profile.entity';
import { Document } from '../../documents/entities/document.entity';

/**
 * Admin directory keyset: newest-first `(createdAt, id)`.
 * Role-filtered browse: `(role, createdAt, id)`.
 */
@Index('IDX_users_created_at_id', ['createdAt', 'id'])
@Index('IDX_users_role_created_at_id', ['role', 'createdAt', 'id'])
@Entity('users')
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  /**
   * bcrypt hash only — never the plaintext password. Defense in depth:
   * `select: false` keeps it out of normal query results entirely (AuthService
   * opts back in via an explicit addSelect when verifying credentials), and
   * @Exclude strips it from any response that does still carry it, via
   * class-transformer (see main.ts's global ClassSerializerInterceptor).
   */
  @Exclude()
  @Column({
    type: 'varchar',
    length: 255,
    name: 'password_hash',
    select: false,
  })
  passwordHash: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  /**
   * Whether the user has completed email/OTP verification (see
   * EmailVerificationService). New users start unverified. Track 1
   * deliberately does NOT gate access to the rest of the API on this flag —
   * see docs/decisions.md, "Email verification does not gate API access
   * (yet)" — it's tracked and exposed so a future product decision can act
   * on it without a schema change.
   */
  @Column({ type: 'boolean', name: 'is_verified', default: false })
  isVerified: boolean;

  /**
   * Minimal V1 RBAC (Track 1, Group B) — see docs/decisions.md, "RBAC: a
   * minimal foundation, not a permissions system". Defaults to the
   * least-privileged role; registration can never set anything else (see
   * UsersService.createUser(), which sets this explicitly rather than
   * relying on the DB default alone — see that method's comment). Never
   * writable via UpdateUserDto/updateMe() — see UsersController/
   * UsersService.update()'s explicit field allowlist.
   */
  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @OneToOne(() => ApplicantProfile, (profile) => profile.user)
  profile?: ApplicantProfile;

  @OneToMany(() => RefreshSession, (session) => session.user)
  refreshSessions?: RefreshSession[];

  @OneToMany(() => Document, (document) => document.owner)
  documents?: Document[];
}
