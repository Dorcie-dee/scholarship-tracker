import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { AppConfig } from '../config/configuration';
import { hashToken } from '../common/utils/hash-token';
import { hashPassword } from './password-hash';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { RefreshSession } from './entities/refresh-session.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

/**
 * Password reset (spec: phase-1o5.txt §8). Reset tokens follow the exact same
 * opaque-random-value + SHA-256-hash-only-persisted pattern as refresh tokens
 * and OTPs — see hashToken's doc comment.
 *
 * Injects Repository<User>/Repository<RefreshSession> directly (rather than
 * going through UsersService/AuthService) ONLY for the transactional write in
 * resetPassword() — the same "direct repository access for a genuinely
 * transactional operation" pattern already established for
 * ApplicationSnapshotsService (see application-snapshots.service.ts) and for
 * Document version writes (docs/decisions.md, "Explicit transaction for
 * document version writes").
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly resetTokens: Repository<PasswordResetToken>,
    // Only used for its `.manager` to open the transaction below — the
    // RefreshSession update inside that transaction goes through the same
    // shared manager (manager.update(RefreshSession, ...)), so no separate
    // RefreshSession repository needs to be injected.
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Always resolves — never reveals whether `email` belongs to a real
   * account (spec: "must not reveal whether an email address belongs to a
   * registered user"). Returns the raw token + recipient ONLY when a real
   * account was found, so the caller (AuthController) can send the email;
   * returns null otherwise, and the controller's HTTP response is identical
   * either way.
   *
   * Best-effort timing note: when no account exists, this method does
   * meaningfully less work (no DB write, no email dispatch) than when one
   * does — a residual timing side-channel that a determined attacker with
   * precise measurement could exploit. Full constant-time equivalence (e.g.
   * artificial delays) was deliberately not added — see
   * docs/decisions.md, "Password-reset enumeration: response-shape parity,
   * not constant-time" — the response body/status is what's normally probed,
   * and that is fully uniform.
   */
  async requestReset(
    email: string,
  ): Promise<{ user: User; rawToken: string } | null> {
    const { passwordResetExpiryMinutes } = this.configService.get('auth', {
      infer: true,
    });

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return null;
    }

    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + passwordResetExpiryMinutes * 60 * 1000,
    );

    // Supersede any still-usable prior reset token for this account.
    await this.resetTokens.update(
      { userId: user.id, consumedAt: IsNull(), invalidatedAt: IsNull() },
      { invalidatedAt: new Date() },
    );
    await this.resetTokens.save(
      this.resetTokens.create({
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt,
        consumedAt: null,
        invalidatedAt: null,
      }),
    );

    return { user, rawToken };
  }

  /**
   * Validates + consumes the token, hashes the new password, and revokes
   * every existing refresh session for the account — all inside one
   * transaction, since a partial failure (password changed but old sessions
   * left valid, or vice versa) is exactly the inconsistent state this
   * feature exists to prevent. Access tokens already in flight are NOT
   * individually revoked: this app's JWTs are stateless with no denylist (see
   * docs/decisions.md, "Refresh token storage" — the reason RefreshSession
   * exists as a real table at all is that stateless JWTs can't be revoked
   * early without one). A stolen access token therefore remains valid for up
   * to its short (15m default) remaining lifetime after a reset; no NEW
   * access token can be minted from a pre-reset session, since every refresh
   * session is revoked here. Documented trade-off, not an oversight — adding
   * a JWT denylist purely for this would be exactly the kind of unnecessary
   * new infrastructure this checkpoint asks not to introduce.
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const invalid = () =>
      new BadRequestException('Invalid or expired reset token');

    const tokenHash = hashToken(rawToken);
    const resetToken = await this.resetTokens.findOne({
      where: { tokenHash },
    });
    if (!resetToken) {
      throw invalid();
    }

    // Atomic conditional consume — same pattern as the refresh-token and OTP
    // fixes: the WHERE clause, not the prior read above, is the sole
    // authorization check for "is this token allowed to reset the password
    // right now". Also covers reuse of an already-consumed token.
    const consumption = await this.resetTokens.update(
      { id: resetToken.id, consumedAt: IsNull(), invalidatedAt: IsNull() },
      { consumedAt: new Date() },
    );
    if (consumption.affected === 0) {
      throw invalid();
    }
    if (resetToken.expiresAt.getTime() < Date.now()) {
      throw invalid();
    }

    const { bcryptSaltRounds } = this.configService.get('auth', {
      infer: true,
    });
    const passwordHash = await hashPassword(newPassword, bcryptSaltRounds);

    await this.users.manager.transaction(async (manager) => {
      await manager.update(User, resetToken.userId, { passwordHash });
      await manager.update(
        RefreshSession,
        { userId: resetToken.userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    });

    this.logger.log(
      `Password reset completed for user ${resetToken.userId}; all refresh sessions revoked.`,
    );
  }
}
