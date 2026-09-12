import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppConfig } from '../config/configuration';
import { RefreshSession } from './entities/refresh-session.entity';
import { EmailVerificationOtp } from './entities/email-verification-otp.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';

/**
 * Production hardening (Batch 2) — periodic cleanup of expired/consumed/
 * invalidated authentication artifacts. Before this, `refresh_sessions`,
 * `email_verification_otps`, and `password_reset_tokens` grew strictly
 * monotonically forever — `AuthService.purgeExpiredSessions()` existed but,
 * per its own doc comment, was "not scheduled automatically." This closes
 * that gap with a lightweight in-process cron (`@nestjs/schedule`), not a
 * queue/worker — this is a single periodic maintenance task, not a
 * job-processing system, and adding one for this would be exactly the kind
 * of unjustified infrastructure this project's own conventions argue
 * against.
 *
 * **Never deletes anything still legitimately usable.** Each predicate below
 * matches this entity's own established lifecycle semantics exactly — the
 * same fields/conditions `AuthService`/`EmailVerificationService`/
 * `PasswordResetService` already use to decide "is this still active" —
 * plus a retention window (`authArtifactRetentionDays`, default 7) past
 * expiry/consumption/invalidation, so a row stays queryable for audit/
 * support purposes for a while after it stops being usable, rather than
 * disappearing the instant it expires.
 *
 * **Idempotent and safe under concurrent execution**: every predicate is a
 * plain, stateless `DELETE ... WHERE <timestamp comparison>` — running it
 * twice (two instances' crons firing close together, or a manual re-run)
 * deletes the same eligible rows once each; there is no ordering dependency
 * and no partial-state to leave inconsistent. No row this job deletes is
 * ever read again by anything else afterward (a deleted refresh session was
 * already unusable — revoked or expired — before this job ever considered
 * it).
 */
@Injectable()
export class AuthCleanupService {
  private readonly logger = new Logger(AuthCleanupService.name);

  constructor(
    @InjectRepository(RefreshSession)
    private readonly refreshSessions: Repository<RefreshSession>,
    @InjectRepository(EmailVerificationOtp)
    private readonly otps: Repository<EmailVerificationOtp>,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokens: Repository<PasswordResetToken>,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  private retentionCutoff(): Date {
    const { authArtifactRetentionDays } = this.configService.get('auth', {
      infer: true,
    });
    return new Date(
      Date.now() - authArtifactRetentionDays * 24 * 60 * 60 * 1000,
    );
  }

  /**
   * Runs hourly — frequent enough that no table accumulates a meaningful
   * backlog between runs, infrequent enough that a full-table-scanning
   * DELETE (see this class's doc comment on why no extra index was added
   * for this job specifically) is a negligible, off-hot-path cost.
   *
   * Logs only row counts, never any row's content — a purged session/OTP/
   * token's hash or user id is exactly the kind of detail this codebase's
   * established logging convention already avoids (see decisions.md).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpiredAuthArtifacts(): Promise<void> {
    const cutoff = this.retentionCutoff();

    const [sessionsRemoved, otpsRemoved, resetTokensRemoved] =
      await Promise.all([
        this.purgeRefreshSessions(cutoff),
        this.purgeOtps(cutoff),
        this.purgeResetTokens(cutoff),
      ]);

    if (sessionsRemoved || otpsRemoved || resetTokensRemoved) {
      this.logger.log(
        `Auth artifact cleanup: removed ${sessionsRemoved} refresh session(s), ` +
          `${otpsRemoved} OTP(s), ${resetTokensRemoved} password reset token(s) ` +
          `past the ${this.configService.get('auth', { infer: true }).authArtifactRetentionDays}-day retention window.`,
      );
    }
  }

  private async purgeRefreshSessions(cutoff: Date): Promise<number> {
    // Eligible once no longer usable (revoked, or naturally expired) AND
    // past the retention window — a still-active, unrevoked, unexpired
    // session is never touched, regardless of age.
    const result = await this.refreshSessions
      .createQueryBuilder()
      .delete()
      .where('expires_at < :cutoff', { cutoff })
      .orWhere('revoked_at IS NOT NULL AND revoked_at < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
  }

  private async purgeOtps(cutoff: Date): Promise<number> {
    const result = await this.otps
      .createQueryBuilder()
      .delete()
      .where('expires_at < :cutoff', { cutoff })
      .orWhere('consumed_at IS NOT NULL AND consumed_at < :cutoff', {
        cutoff,
      })
      .orWhere('invalidated_at IS NOT NULL AND invalidated_at < :cutoff', {
        cutoff,
      })
      .execute();
    return result.affected ?? 0;
  }

  private async purgeResetTokens(cutoff: Date): Promise<number> {
    const result = await this.resetTokens
      .createQueryBuilder()
      .delete()
      .where('expires_at < :cutoff', { cutoff })
      .orWhere('consumed_at IS NOT NULL AND consumed_at < :cutoff', {
        cutoff,
      })
      .orWhere('invalidated_at IS NOT NULL AND invalidated_at < :cutoff', {
        cutoff,
      })
      .execute();
    return result.affected ?? 0;
  }
}
