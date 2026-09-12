import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * One row per issued refresh credential ("session"). A user can have several
 * concurrent rows — one per device/browser — enabling per-device logout and
 * future session-management UI (spec: "User -> Session A/B/C").
 *
 * IMPORTANT: `tokenHash` is a SHA-256 hash of the opaque refresh token. The raw
 * token is only ever handed to the client once (via an HttpOnly cookie at
 * issuance/rotation time) and is never persisted — see docs/decisions.md,
 * "Refresh token storage".
 */
@Entity('refresh_sessions')
export class RefreshSession extends BaseEntity {
  @ManyToOne(() => User, (user) => user.refreshSessions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /**
   * Production hardening (Batch 2) — indexed: `logoutAll()`,
   * `listActiveSessions()` (`GET /auth/sessions`), and the refresh-token
   * reuse-detection sweep inside every `refresh()` call all filter by this
   * column. Without an index, all three become sequential scans on a table
   * that (per-user session churn, no automatic purge before this batch)
   * grows without bound — a hot, security-critical path degrading with
   * scale. See docs/decisions.md, "refresh_sessions.user_id index".
   */
  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Index()
  @Column({ type: 'varchar', length: 255, name: 'token_hash' })
  tokenHash: string;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', name: 'last_used_at' })
  lastUsedAt: Date;

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt: Date | null;

  /**
   * Set when this session was revoked because a rotated-out token was replayed
   * (reuse/theft signal) rather than an ordinary logout. Purely informational —
   * used for future security auditing/notifications.
   */
  @Column({ type: 'boolean', name: 'revoked_due_to_reuse', default: false })
  revokedDueToReuse: boolean;

  @Column({ type: 'varchar', length: 512, name: 'user_agent', nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 64, name: 'ip_address', nullable: true })
  ipAddress: string | null;
}
