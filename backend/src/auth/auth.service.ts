import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { EntityManager, IsNull, LessThan, Repository } from 'typeorm';
import { AppConfig } from '../config/configuration';
import { hashToken } from '../common/utils/hash-token';
import { hashPassword, comparePassword } from './password-hash';
import { UsersService } from '../users/users.service';
import { ProfileService } from '../profile/profile.service';
import { EmailVerificationService } from './email-verification.service';
import { EmailService } from '../common/email/email.service';
import { User } from '../users/entities/user.entity';
import { RefreshSession } from './entities/refresh-session.entity';

export interface RequestMeta {
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

/**
 * refresh()'s transaction callback resolves with one of these — it must
 * never throw (see refresh()'s doc comment for why). The actual
 * UnauthorizedException is thrown outside the transaction, after commit.
 */
type RefreshOutcome =
  | { ok: true; user: User; tokens: IssuedTokens }
  | { ok: false; reason: 'reuse' | 'expired' };

/**
 * Refresh-token rotation with reuse detection (spec: "Session A/B/C",
 * multi-device auth). Design notes live in docs/decisions.md under
 * "Refresh token storage" — short version:
 *
 *  - The refresh token itself is an opaque random string, never a JWT. Only
 *    its SHA-256 hash is persisted, so a database read alone can't produce a
 *    usable credential.
 *  - Every refresh ROTATES: the presented token's session is revoked and a
 *    brand new session/token pair is issued. The old token can never be used
 *    again, even if it hadn't expired.
 *  - If an already-revoked token is presented again, that can only happen via
 *    replay of a stolen/leaked token (the legitimate client would have moved
 *    on to the rotated one) — so we revoke every session for that user as a
 *    precaution and force a full re-login.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly profileService: ProfileService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
    @InjectRepository(RefreshSession)
    private readonly refreshSessions: Repository<RefreshSession>,
  ) {}

  async register(
    params: { email: string; password: string; name?: string },
    meta: RequestMeta,
  ): Promise<{ user: User; tokens: IssuedTokens }> {
    const saltRounds = this.configService.get('auth', {
      infer: true,
    }).bcryptSaltRounds;
    const passwordHash = await hashPassword(params.password, saltRounds);
    const user = await this.usersService.createUser({
      email: params.email,
      passwordHash,
      name: params.name,
    });
    await this.profileService.createEmptyProfile(user.id);
    const tokens = await this.issueTokens(user, meta);

    // Best-effort: a failure to send the verification email must not fail
    // registration itself — the account and its OTP row both already exist,
    // and the user has a resend path. Logged, not swallowed silently.
    try {
      const { otp, expiresAt } = await this.emailVerificationService.issueOtp(
        user.id,
      );
      await this.emailService.sendVerificationOtpEmail({
        to: user.email,
        otp,
        expiresAt,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to issue/send verification email for user ${user.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return { user, tokens };
  }

  async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.usersService.findByEmail(email, true);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const matches = await comparePassword(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return user;
  }

  async login(
    email: string,
    password: string,
    meta: RequestMeta,
  ): Promise<{ user: User; tokens: IssuedTokens }> {
    const user = await this.validateCredentials(email, password);
    const tokens = await this.issueTokens(user, meta);
    return { user, tokens };
  }

  /**
   * `manager` defaults to the repository's own (non-transactional) manager —
   * that's what login()/register() use, where issuing a session is a plain,
   * unconditional write with nothing to serialize against. refresh() passes
   * its transaction's manager explicitly instead, so the new session INSERT
   * happens inside the same advisory-locked transaction as the old session's
   * consumption — see refresh()'s doc comment for why that matters.
   */
  private async issueTokens(
    user: User,
    meta: RequestMeta,
    manager: EntityManager = this.refreshSessions.manager,
  ): Promise<IssuedTokens> {
    const authConfig = this.configService.get('auth', { infer: true });

    const accessTokenExpiresInMs = parseExpiryToMs(
      authConfig.accessTokenExpiresIn,
    );
    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        isVerified: user.isVerified,
        role: user.role,
      },
      {
        secret: authConfig.accessTokenSecret,
        // jsonwebtoken's `expiresIn` accepts a plain number of seconds — passing
        // that instead of the raw config string sidesteps its narrower
        // template-literal type (e.g. "15m") that our config string can't match.
        expiresIn: Math.floor(accessTokenExpiresInMs / 1000),
      },
    );
    const accessTokenExpiresAt = new Date(Date.now() + accessTokenExpiresInMs);

    const refreshToken = randomBytes(48).toString('hex');
    const refreshTokenExpiresAt = new Date(
      Date.now() + authConfig.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    );

    const session = manager.create(RefreshSession, {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshTokenExpiresAt,
      lastUsedAt: new Date(),
      revokedAt: null,
      revokedDueToReuse: false,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
    });
    await manager.save(session);

    return {
      accessToken,
      accessTokenExpiresAt,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }

  /**
   * Track 1 / A1.1 fix, in two layers:
   *
   * Layer 1 — the single-token race. The previous implementation read
   * `session.revokedAt` and only afterward issued a separate `update()` to
   * revoke it — a TOCTOU race where two concurrent calls presenting the SAME
   * valid token could both observe `revokedAt: null` before either write
   * landed, both pass the reuse check, and both successfully rotate.
   * Fixed by making the WHERE clause of the revoking UPDATE itself the sole
   * authorization check ("consume this row only if it is still unrevoked")
   * and inspecting `affected`: at most one concurrent caller can ever receive
   * `affected === 1` for a given row — Postgres serializes concurrent UPDATEs
   * to the same row, so this is atomic by construction.
   *
   * Layer 2 — a second-order race this fix's own test uncovered: the
   * *loser's* "revoke every session for this user" sweep is a separate
   * statement from the *winner's* "create a brand-new session" INSERT
   * (itself downstream of an await chain: fetch the user, sign a JWT, then
   * insert). If the sweep runs before that INSERT completes, the winner's
   * new session — created by the very race being defended against — can
   * escape it. Closed by acquiring a per-user Postgres advisory lock
   * (`pg_advisory_xact_lock`, released automatically at transaction end) for
   * the ENTIRE consume-or-reuse-and-issue sequence: only one refresh for a
   * given user can be mid-flight at a time, so the sweep and the INSERT can
   * no longer interleave. The initial lookup-by-tokenHash stays outside the
   * lock (a plain read, nothing to serialize against yet) — everything from
   * "we know which user this affects" onward runs inside it.
   *
   * The advisory lock's actual serialization guarantee is a property of real
   * Postgres and isn't something a mocked unit test can exercise — see
   * auth.service.spec.ts's concurrency test, which proves the affected-count
   * branch logic instead and documents this boundary explicitly. The
   * blocking behaviour itself (same key serializes, different keys don't,
   * the lock releases on both COMMIT and ROLLBACK) was verified directly
   * against Neon DEVELOP — see docs/decisions.md, "Advisory lock: verified
   * against real Postgres".
   *
   * CRITICAL correctness rule, found during the Track 1 hardening pass: the
   * transaction callback below must NEVER throw. TypeORM's
   * `manager.transaction()` rolls back every write made inside the callback
   * the moment it rejects (see node_modules/typeorm/entity-manager/
   * EntityManager.js's transaction() — catch → rollbackTransaction() →
   * rethrow). An earlier version of this method threw
   * UnauthorizedException directly inside the reuse-detected branch, AFTER
   * writing the "revoke every session for this user" sweep — which silently
   * discarded that exact write on rollback, defeating reuse detection
   * entirely while still reporting success (an error) to the caller. Fixed
   * by having the callback always RESOLVE with an outcome value; the actual
   * exception is thrown outside the transaction, after it has committed —
   * see auth.service.spec.ts's "reuse-detection writes actually persist"
   * test, which is what caught this.
   */
  async refresh(
    presentedToken: string,
    meta: RequestMeta,
  ): Promise<{ user: User; tokens: IssuedTokens }> {
    const tokenHash = hashToken(presentedToken);
    const session = await this.refreshSessions.findOne({
      where: { tokenHash },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const outcome = await this.refreshSessions.manager.transaction(
      async (manager): Promise<RefreshOutcome> => {
        // hashtext() maps the userId string to a stable int4; the bigint
        // cast matches pg_advisory_xact_lock's signature. Scoped to this
        // transaction only — released automatically on commit OR rollback,
        // never needs an explicit unlock call (verified directly against
        // Neon DEVELOP — see docs/decisions.md).
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
          [session.userId],
        );

        const consumption = await manager.update(
          RefreshSession,
          { id: session.id, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );

        if (consumption.affected === 0) {
          this.logger.warn(
            `Refresh token reuse detected for user ${session.userId}; revoking all sessions.`,
          );
          await manager.update(
            RefreshSession,
            { userId: session.userId, revokedAt: IsNull() },
            { revokedAt: new Date(), revokedDueToReuse: true },
          );
          return { ok: false, reason: 'reuse' };
        }

        if (session.expiresAt.getTime() < Date.now()) {
          // Already consumed above (correct — an expired session shouldn't
          // stay usable either); reported as a distinct outcome below.
          return { ok: false, reason: 'expired' };
        }

        // We won the race for this session row — safe to proceed.
        // Deliberately NOT parallelized with the update above via
        // Promise.all: this fetch must only happen once we know we're
        // authorized to issue new tokens, not before — see
        // docs/decisions.md, "Refresh-token fetch stays sequential after the
        // atomic consume".
        const user = await this.usersService.getByIdOrThrow(session.userId);
        const tokens = await this.issueTokens(user, meta, manager);

        return { ok: true, user, tokens };
      },
    );

    if (!outcome.ok) {
      if (outcome.reason === 'reuse') {
        throw new UnauthorizedException(
          'Refresh token reuse detected. All sessions have been revoked — please log in again.',
        );
      }
      throw new UnauthorizedException('Refresh token has expired');
    }

    return { user: outcome.user, tokens: outcome.tokens };
  }

  async logout(presentedToken: string): Promise<void> {
    const tokenHash = hashToken(presentedToken);
    await this.refreshSessions.update(
      { tokenHash, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshSessions.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async listActiveSessions(userId: string): Promise<RefreshSession[]> {
    return this.refreshSessions.find({
      where: { userId, revokedAt: IsNull() },
      order: { lastUsedAt: 'DESC' },
    });
  }

  /** Housekeeping hook (not scheduled automatically in v1) — see docs/decisions.md. */
  async purgeExpiredSessions(): Promise<number> {
    const result = await this.refreshSessions.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected ?? 0;
  }
}

/** Parses simple JWT-style durations ("15m", "1h", "7d", "30s") into milliseconds. */
function parseExpiryToMs(value: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(value.trim());
  if (!match) {
    // Fall back to treating it as a raw seconds count, per jsonwebtoken's own convention.
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber * 1000 : 15 * 60 * 1000;
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const unitMs: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return amount * unitMs[unit];
}
