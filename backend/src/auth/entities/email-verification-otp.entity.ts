import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * One row per issued email-verification OTP. `otpHash` is a SHA-256 hash of
 * the raw 6-digit code — the raw code is only ever handed to the client via
 * the (dev-only, for now) email boundary, never persisted — same reasoning as
 * RefreshSession.tokenHash, see docs/decisions.md, "Refresh token storage".
 *
 * A user can accumulate multiple rows over time (each registration/resend
 * issues a new one); only the most recent, still-active one is ever usable —
 * see EmailVerificationService, which invalidates any prior active row before
 * inserting a new one.
 */
@Entity('email_verification_otps')
export class EmailVerificationOtp extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 255, name: 'otp_hash' })
  otpHash: string;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  /** Set once this OTP has been successfully used to verify the account. */
  @Column({ type: 'timestamptz', name: 'consumed_at', nullable: true })
  consumedAt: Date | null;

  /**
   * Set when this OTP is no longer usable for a reason OTHER than a
   * successful verification: superseded by a newer resend, or the attempt
   * limit was exceeded. Kept distinct from `consumedAt` so the row's history
   * is unambiguous (succeeded vs. simply retired) without inventing a status
   * enum for what is otherwise a 3-state, mostly-linear lifecycle.
   */
  @Column({ type: 'timestamptz', name: 'invalidated_at', nullable: true })
  invalidatedAt: Date | null;
}
