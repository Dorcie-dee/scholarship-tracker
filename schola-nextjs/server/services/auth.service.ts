import type { ClientSession, Types } from 'mongoose';
import { User, type UserHydrated } from '../models/user.model';
import { ApplicantProfile } from '../models/applicant-profile.model';
import { RefreshSession } from '../models/refresh-session.model';
import { EmailVerificationOtp } from '../models/email-verification-otp.model';
import { PasswordResetToken } from '../models/password-reset-token.model';
import {
  signAccessToken,
  hashPassword,
  verifyPassword,
  generateOpaqueToken,
  hashOpaqueToken,
  generateOtp,
  type AccessTokenClaims,
} from '../lib/auth';
import { getConfig } from '../lib/config';
import { withTransaction } from '../lib/db';
import { normalizeEmail } from '../lib/normalize-email';
import {
  assertLoginNotLocked,
  recordLoginFailure,
  recordLoginSuccess,
} from '../lib/rate-limit';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../lib/http-errors';
import { UserRole, type SafeUser } from '../lib/enums';

/**
 * Plain, framework-agnostic business logic for the `/api/auth/*` routes —
 * ported from the NestJS backend's `auth/auth.service.ts`,
 * `auth/email-verification.service.ts`, `auth/password-reset.service.ts`,
 * and `auth/auth-cleanup.service.ts`. See each exported function's doc
 * comment for the specific original it replaces.
 *
 * Login-lockout (account-scoped brute-force throttle) is NOT reimplemented
 * here — `server/lib/rate-limit.ts`'s `assertLoginNotLocked` /
 * `recordLoginFailure` / `recordLoginSuccess` already port
 * `auth/login-guard.service.ts` 1:1; `login()` below just calls them,
 * exactly where the original `AuthService.login()` called
 * `LoginGuardService`'s equivalents.
 */

export interface RequestMeta {
  userAgent: string | null;
  ipAddress: string | null;
}

export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface AuthResult {
  user: SafeUser;
  tokens: IssuedTokens;
}

export interface SessionSummary {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  userAgent: string | null;
  ipAddress: string | null;
}

export interface MeResponse {
  userId: string;
  email: string;
  isVerified: boolean;
  role: UserRole;
}

export function toSafeUser(user: UserHydrated): SafeUser {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    isVerified: user.isVerified,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

/** MongoDB duplicate-key error (E11000) — the unique-index analogue of Postgres's 23505. */
function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 11000
  );
}

/**
 * Issues a fresh access token + refresh session for `user`. `session`, when
 * provided, is `refresh()`'s transaction session — so the new session INSERT
 * lands in the same atomic unit as the old session's consumption (see
 * `refresh()`'s doc comment).
 */
async function issueTokens(
  user: UserHydrated,
  meta: RequestMeta,
  session?: ClientSession,
): Promise<IssuedTokens> {
  const { token: accessToken, expiresAt: accessTokenExpiresAt } = await signAccessToken({
    userId: String(user._id),
    email: user.email,
    role: user.role,
    isVerified: user.isVerified,
  });

  const { refreshTokenTtlDays } = getConfig().auth;
  const refreshToken = generateOpaqueToken(48);
  const refreshTokenExpiresAt = new Date(
    Date.now() + refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  );

  await RefreshSession.create(
    [
      {
        userId: user._id,
        tokenHash: hashOpaqueToken(refreshToken),
        expiresAt: refreshTokenExpiresAt,
        lastUsedAt: new Date(),
        revokedAt: null,
        revokedDueToReuse: false,
        userAgent: meta.userAgent ?? null,
        ipAddress: meta.ipAddress ?? null,
      },
    ],
    { session },
  );

  return { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt };
}

/** Supersedes any still-active OTP for `userId` and issues + persists a fresh one. Returns the RAW code. */
async function issueVerificationOtp(
  userId: Types.ObjectId | string,
): Promise<{ otp: string; expiresAt: Date }> {
  const { otpExpiryMinutes } = getConfig().auth;

  await EmailVerificationOtp.updateMany(
    { userId, consumedAt: null, invalidatedAt: null },
    { $set: { invalidatedAt: new Date() } },
  );

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);

  await EmailVerificationOtp.create({
    userId,
    otpHash: hashOpaqueToken(otp),
    expiresAt,
    attempts: 0,
    consumedAt: null,
    invalidatedAt: null,
  });

  return { otp, expiresAt };
}

/**
 * Creates the user + an empty applicant profile, issues tokens, and
 * best-effort issues + returns a verification OTP for the caller to email —
 * ported from `AuthService.register()`. A failure to issue/send the OTP must
 * NOT fail registration (the account already exists and has a resend path);
 * callers that want to actually deliver the email should catch around that
 * step themselves (the route handler does), mirroring the original's
 * try/catch-and-log.
 */
export async function register(
  params: { email: string; password: string; name?: string },
  meta: RequestMeta,
): Promise<AuthResult & { pendingOtp: { otp: string; expiresAt: Date } | null }> {
  const normalizedEmail = normalizeEmail(params.email);
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  const passwordHash = await hashPassword(params.password);

  let user: UserHydrated;
  try {
    user = await User.create({
      email: normalizedEmail,
      passwordHash,
      name: params.name ?? null,
      isVerified: false,
      role: UserRole.USER,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new ConflictError('An account with this email already exists');
    }
    throw err;
  }

  await ApplicantProfile.create({
    userId: user._id,
    nationality: null,
    dateOfBirth: null,
    summary: null,
    education: [],
    experience: [],
    skills: [],
    certifications: [],
    languages: [],
    metadata: {},
  });

  const tokens = await issueTokens(user, meta);

  let pendingOtp: { otp: string; expiresAt: Date } | null = null;
  try {
    pendingOtp = await issueVerificationOtp(user._id);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      `Failed to issue verification OTP for user ${user._id}:`,
      error instanceof Error ? error.message : error,
    );
  }

  return { user: toSafeUser(user), tokens, pendingOtp };
}

/**
 * Account-scoped lockout (via `server/lib/rate-limit.ts`) wraps credential
 * validation: checked before even reading the user row, reset on success,
 * recorded on a confirmed bad-credentials failure. Every rejection path
 * (unknown email vs. wrong password) returns the exact same error — ported
 * from `AuthService.login()` / `AuthService.validateCredentials()`.
 */
export async function login(
  email: string,
  password: string,
  meta: RequestMeta,
): Promise<AuthResult> {
  const normalizedEmail = normalizeEmail(email);
  await assertLoginNotLocked(normalizedEmail);

  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !valid) {
    await recordLoginFailure(normalizedEmail);
    throw new UnauthorizedError('Invalid email or password');
  }

  await recordLoginSuccess(normalizedEmail);
  const tokens = await issueTokens(user, meta);
  return { user: toSafeUser(user), tokens };
}

type RefreshOutcome =
  | { ok: true; user: UserHydrated; tokens: IssuedTokens }
  | { ok: false; reason: 'reuse' | 'expired' | 'user-not-found' };

/**
 * Refresh-token rotation with reuse detection — ported from
 * `AuthService.refresh()`. The refresh token is an opaque random string,
 * never a JWT; only its SHA-256 hash is persisted. Every refresh ROTATES:
 * the presented token's session is atomically consumed (revoked) and a new
 * session/token pair is issued; the old token can never be used again. If an
 * already-revoked token is presented again, every session for that user is
 * revoked as a precaution and the caller must log in again.
 *
 * The original Postgres implementation needed an explicit per-user advisory
 * lock to close a second-order race: the token-consume UPDATE and the new
 * session INSERT were separate statements, so a concurrent "reuse" sweep
 * could run between them and miss the just-created session. Here, the
 * consume, the reuse-sweep, and the new-session insert all happen inside one
 * MongoDB multi-document transaction (`withTransaction`) — document-level
 * locking during that transaction already serializes a concurrent
 * request touching the same session row, so the equivalent race is closed by
 * construction without needing a separate advisory-lock primitive.
 *
 * Like the original, the transaction callback never throws for an
 * authorization failure — it resolves with a `RefreshOutcome`, and the
 * actual `UnauthorizedError` is thrown after the transaction has committed,
 * so a reuse-detected sweep's writes are never rolled back by the rejection
 * they're meant to cause.
 */
export async function refresh(
  presentedToken: string,
  meta: RequestMeta,
): Promise<AuthResult> {
  const tokenHash = hashOpaqueToken(presentedToken);
  const session = await RefreshSession.findOne({ tokenHash });
  if (!session) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  const outcome = await withTransaction<RefreshOutcome>(async (dbSession) => {
    const consumed = await RefreshSession.findOneAndUpdate(
      { _id: session._id, revokedAt: null },
      { $set: { revokedAt: new Date() } },
      { session: dbSession },
    );

    if (!consumed) {
      // Reuse of an already-revoked token can only happen via replay of a
      // stolen/leaked token — revoke every active session for this user.
      await RefreshSession.updateMany(
        { userId: session.userId, revokedAt: null },
        { $set: { revokedAt: new Date(), revokedDueToReuse: true } },
        { session: dbSession },
      );
      return { ok: false, reason: 'reuse' };
    }

    if (session.expiresAt.getTime() < Date.now()) {
      // Already consumed above (correct — an expired session shouldn't stay
      // usable either); reported as a distinct outcome below.
      return { ok: false, reason: 'expired' };
    }

    const refreshedUser = await User.findById(session.userId).session(dbSession);
    if (!refreshedUser) {
      return { ok: false, reason: 'user-not-found' };
    }

    const tokens = await issueTokens(refreshedUser, meta, dbSession);
    return { ok: true, user: refreshedUser, tokens };
  });

  if (!outcome.ok) {
    if (outcome.reason === 'reuse') {
      throw new UnauthorizedError(
        'Refresh token reuse detected. All sessions have been revoked — please log in again.',
      );
    }
    if (outcome.reason === 'expired') {
      throw new UnauthorizedError('Refresh token has expired');
    }
    throw new UnauthorizedError('Invalid refresh token');
  }

  return { user: toSafeUser(outcome.user), tokens: outcome.tokens };
}

/** Acts on the refresh cookie only — ported from `AuthService.logout()`. A no-op if the token is unknown/already revoked. */
export async function logout(presentedToken: string): Promise<void> {
  const tokenHash = hashOpaqueToken(presentedToken);
  await RefreshSession.updateOne(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

/** Revokes every active session for `userId` — ported from `AuthService.logoutAll()`. */
export async function logoutAll(userId: string): Promise<void> {
  await RefreshSession.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

/** Lists active (non-revoked) sessions, newest-used-first — ported from `AuthService.listActiveSessions()`. */
export async function listSessions(userId: string): Promise<SessionSummary[]> {
  const sessions = await RefreshSession.find({ userId, revokedAt: null })
    .sort({ lastUsedAt: -1 })
    .lean<
      {
        _id: Types.ObjectId;
        createdAt: Date;
        lastUsedAt: Date;
        expiresAt: Date;
        userAgent: string | null;
        ipAddress: string | null;
      }[]
    >();

  return sessions.map((s) => ({
    id: String(s._id),
    createdAt: s.createdAt.toISOString(),
    lastUsedAt: s.lastUsedAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    userAgent: s.userAgent,
    ipAddress: s.ipAddress,
  }));
}

/**
 * Echoes the caller's own access-token claims — ported from
 * `AuthController.me()` / `JwtStrategy.validate()`, which return the token's
 * claims directly rather than re-reading the user row (so this reflects
 * exactly what the current access token asserts, which may lag a very
 * recent role/verification change until the token is refreshed).
 */
export function me(user: AccessTokenClaims): MeResponse {
  return {
    userId: user.sub,
    email: user.email,
    isVerified: user.isVerified,
    role: user.role,
  };
}

/** Ported from `EmailVerificationService.verify()`. */
export async function verifyEmail(userId: string, code: string): Promise<void> {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  if (user.isVerified) {
    return; // Already verified — a repeat submission is a safe no-op.
  }

  const { otpMaxAttempts } = getConfig().auth;
  const active = await EmailVerificationOtp.findOne({
    userId,
    consumedAt: null,
    invalidatedAt: null,
  }).sort({ createdAt: -1 });

  const invalid = () => new BadRequestError('Invalid or expired verification code');

  if (!active) {
    throw invalid();
  }
  if (active.expiresAt.getTime() < Date.now()) {
    await EmailVerificationOtp.updateOne(
      { _id: active._id, invalidatedAt: null },
      { $set: { invalidatedAt: new Date() } },
    );
    throw invalid();
  }

  if (hashOpaqueToken(code) !== active.otpHash) {
    await EmailVerificationOtp.updateOne({ _id: active._id }, { $inc: { attempts: 1 } });
    if (active.attempts + 1 >= otpMaxAttempts) {
      await EmailVerificationOtp.updateOne(
        { _id: active._id, invalidatedAt: null },
        { $set: { invalidatedAt: new Date() } },
      );
      throw new BadRequestError(
        'Too many incorrect attempts. Request a new verification code.',
      );
    }
    throw invalid();
  }

  const consumption = await EmailVerificationOtp.updateOne(
    { _id: active._id, consumedAt: null, invalidatedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  if (consumption.modifiedCount === 0) {
    throw invalid();
  }

  user.isVerified = true;
  await user.save();
}

/**
 * Issues a fresh OTP for the caller's own account, enforcing a
 * data-layer resend cooldown (not just the route's rate limit) — ported
 * from `EmailVerificationService.resend()`. Returns the raw OTP for the
 * route handler to email; a delivery failure there is the route's concern
 * (surfaced as a hard error, unlike register()'s best-effort send).
 */
export async function resendVerification(
  userId: string,
): Promise<{ otp: string; expiresAt: Date }> {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  if (user.isVerified) {
    throw new BadRequestError('This account is already verified');
  }

  const { otpResendCooldownSeconds } = getConfig().auth;
  const mostRecent = await EmailVerificationOtp.findOne({ userId })
    .sort({ createdAt: -1 })
    .lean<{ createdAt: Date } | null>();

  if (mostRecent) {
    const elapsedMs = Date.now() - mostRecent.createdAt.getTime();
    if (elapsedMs < otpResendCooldownSeconds * 1000) {
      throw new TooManyRequestsError(
        'Please wait before requesting another verification code',
      );
    }
  }

  return issueVerificationOtp(user._id);
}

/**
 * Always resolves — never reveals whether `email` belongs to a real account.
 * Returns the raw token + recipient ONLY when a real account was found, so
 * the route handler can send the email; returns `null` otherwise, with the
 * HTTP response identical either way. Ported from
 * `PasswordResetService.requestReset()`.
 */
export async function forgotPassword(
  email: string,
): Promise<{ user: SafeUser; rawToken: string } | null> {
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    return null;
  }

  const { passwordResetExpiryMinutes } = getConfig().auth;
  const rawToken = generateOpaqueToken(32);
  const expiresAt = new Date(Date.now() + passwordResetExpiryMinutes * 60 * 1000);

  await PasswordResetToken.updateMany(
    { userId: user._id, consumedAt: null, invalidatedAt: null },
    { $set: { invalidatedAt: new Date() } },
  );
  await PasswordResetToken.create({
    userId: user._id,
    tokenHash: hashOpaqueToken(rawToken),
    expiresAt,
    consumedAt: null,
    invalidatedAt: null,
  });

  return { user: toSafeUser(user), rawToken };
}

/**
 * Validates + consumes the reset token, hashes the new password, and
 * revokes every existing refresh session for the account, all inside one
 * transaction — ported from `PasswordResetService.resetPassword()`. Access
 * tokens already in flight are NOT individually revoked (this app's JWTs are
 * stateless with no denylist, same as the original) — a stolen access token
 * remains valid for up to its short remaining lifetime; no new access token
 * can be minted from a pre-reset session since every refresh session is
 * revoked here.
 */
export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const invalid = () => new BadRequestError('Invalid or expired reset token');

  const tokenHash = hashOpaqueToken(rawToken);
  const resetToken = await PasswordResetToken.findOne({ tokenHash });
  if (!resetToken) {
    throw invalid();
  }

  // Atomic conditional consume — the sole authorization check for "is this
  // token allowed to reset the password right now" (also covers reuse of an
  // already-consumed token), same pattern as refresh()'s session consume.
  const consumption = await PasswordResetToken.updateOne(
    { _id: resetToken._id, consumedAt: null, invalidatedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  if (consumption.modifiedCount === 0) {
    throw invalid();
  }
  if (resetToken.expiresAt.getTime() < Date.now()) {
    throw invalid();
  }

  const passwordHash = await hashPassword(newPassword);

  await withTransaction(async (dbSession) => {
    await User.updateOne(
      { _id: resetToken.userId },
      { $set: { passwordHash } },
      { session: dbSession },
    );
    await RefreshSession.updateMany(
      { userId: resetToken.userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
      { session: dbSession },
    );
  });
}

export interface CleanupResult {
  sessionsRemoved: number;
  otpsRemoved: number;
  resetTokensRemoved: number;
}

/**
 * Purges expired/revoked/consumed/invalidated auth artifacts past the
 * configured retention window — ported from
 * `AuthCleanupService.purgeExpiredAuthArtifacts()`. Never deletes anything
 * still legitimately usable: each predicate matches the same fields/
 * conditions `login`/`refresh`/`verifyEmail`/`resetPassword` already use to
 * decide "is this still active", plus the retention window. There is no
 * `@Cron` equivalent in this app — see `server/scripts/cleanup-auth-artifacts.ts`
 * for the CLI entry a scheduled trigger (Vercel Cron or similar) should call.
 */
export async function cleanupExpiredAuthArtifacts(): Promise<CleanupResult> {
  const { artifactRetentionDays } = getConfig().auth;
  const cutoff = new Date(Date.now() - artifactRetentionDays * 24 * 60 * 60 * 1000);

  const [sessions, otps, resetTokens] = await Promise.all([
    RefreshSession.deleteMany({
      $or: [
        { expiresAt: { $lt: cutoff } },
        { revokedAt: { $ne: null, $lt: cutoff } },
      ],
    }),
    EmailVerificationOtp.deleteMany({
      $or: [
        { expiresAt: { $lt: cutoff } },
        { consumedAt: { $ne: null, $lt: cutoff } },
        { invalidatedAt: { $ne: null, $lt: cutoff } },
      ],
    }),
    PasswordResetToken.deleteMany({
      $or: [
        { expiresAt: { $lt: cutoff } },
        { consumedAt: { $ne: null, $lt: cutoff } },
        { invalidatedAt: { $ne: null, $lt: cutoff } },
      ],
    }),
  ]);

  return {
    sessionsRemoved: sessions.deletedCount ?? 0,
    otpsRemoved: otps.deletedCount ?? 0,
    resetTokensRemoved: resetTokens.deletedCount ?? 0,
  };
}
