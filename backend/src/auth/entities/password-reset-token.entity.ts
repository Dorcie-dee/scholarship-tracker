import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * One row per issued password-reset credential. Same shape/reasoning as
 * EmailVerificationOtp: `tokenHash` is a SHA-256 hash of an opaque random
 * token (never a JWT — validated against this table, same reasoning as
 * RefreshSession, see docs/decisions.md, "Refresh token storage"), the raw
 * token is only ever handed to the client via the email boundary.
 */
@Entity('password_reset_tokens')
export class PasswordResetToken extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Index()
  @Column({ type: 'varchar', length: 255, name: 'token_hash' })
  tokenHash: string;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  /** Set once this token has been successfully used to reset the password. */
  @Column({ type: 'timestamptz', name: 'consumed_at', nullable: true })
  consumedAt: Date | null;

  /** Set when superseded by a newer forgot-password request. */
  @Column({ type: 'timestamptz', name: 'invalidated_at', nullable: true })
  invalidatedAt: Date | null;
}
