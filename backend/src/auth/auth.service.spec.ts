import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '../types';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const authConfig = {
    accessTokenSecret: 'test-secret',
    accessTokenExpiresIn: '15m',
    refreshTokenTtlDays: 30,
    refreshCookieName: 'refresh_token',
    bcryptSaltRounds: 4,
    otpExpiryMinutes: 10,
    otpMaxAttempts: 5,
    otpResendCooldownSeconds: 60,
    passwordResetExpiryMinutes: 30,
  };

  const configService = { get: jest.fn(() => authConfig) } as any;
  const jwtService = {
    signAsync: jest.fn(async () => 'signed.jwt.token'),
  } as any;

  const makeUser = (overrides: Partial<any> = {}) => ({
    id: 'user-1',
    email: 'person@example.invalid',
    passwordHash: 'irrelevant',
    name: 'Person',
    isVerified: false,
    role: UserRole.USER,
    ...overrides,
  });

  let usersService: any;
  let profileService: any;
  let emailVerificationService: any;
  let emailService: any;
  let loginGuardService: any;
  let refreshSessions: any;
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    usersService = {
      findByEmail: jest.fn(),
      getByIdOrThrow: jest.fn(),
      createUser: jest.fn(),
    };
    profileService = { createEmptyProfile: jest.fn() };
    emailVerificationService = {
      issueOtp: jest.fn(async () => ({
        otp: '123456',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      })),
    };
    emailService = { sendVerificationOtpEmail: jest.fn(async () => undefined) };
    loginGuardService = {
      assertNotLocked: jest.fn(async () => undefined),
      recordFailure: jest.fn(async () => undefined),
      recordSuccess: jest.fn(async () => undefined),
    };

    // In-memory "table" so tests can exercise real rotation/reuse logic
    // instead of re-asserting whatever the mock was told to return.
    // `update()` returns { affected } like TypeORM's real UpdateResult —
    // required for AuthService.refresh()'s atomic-consume check to be
    // meaningfully exercised at all, not just assumed to pass.
    const rows = new Map<string, any>();
    let nextId = 1;
    const matchesCriteria = (row: any, criteria: any): boolean => {
      if (typeof criteria === 'string') return row.id === criteria;
      return Object.entries(criteria).every(([k, v]) =>
        // Treat IsNull()-style FindOperator loosely: any non-primitive means "IS NULL".
        typeof v === 'object' && v !== null ? row[k] === null : row[k] === v,
      );
    };
    const create = (partial: any) => ({ ...partial });
    const save = async (row: any) => {
      const withId = { id: row.id ?? `session-${nextId++}`, ...row };
      rows.set(withId.id, withId);
      return withId;
    };
    const findOne = async ({ where }: any) => {
      for (const row of rows.values()) {
        if (matchesCriteria(row, where)) return row;
      }
      return null;
    };
    const update = async (criteria: any, partial: any) => {
      let affected = 0;
      for (const row of rows.values()) {
        if (matchesCriteria(row, criteria)) {
          Object.assign(row, partial);
          affected++;
        }
      }
      return { affected, raw: [], generatedMaps: [] };
    };

    // fakeManager mirrors the subset of TypeORM's EntityManager API
    // AuthService.refresh()/issueTokens() actually call — same
    // manager.transaction(cb) mock pattern already established for Document
    // version writes (see documents.service.spec.ts, Checkpoint 6).
    // `query()` (the advisory lock) is a no-op here — real serialization is a
    // property of Postgres itself, not something this mock can exercise; see
    // AuthService.refresh()'s doc comment.
    const fakeManager = {
      query: jest.fn(async () => undefined),
      create: (_entity: any, partial: any) => create(partial),
      save: (row: any) => save(row),
      update: (_entity: any, criteria: any, partial: any) =>
        update(criteria, partial),
    };

    refreshSessions = {
      create: jest.fn(create),
      save: jest.fn(save),
      findOne: jest.fn(findOne),
      update: jest.fn(update),
      delete: jest.fn(),
      find: jest.fn(async () => [...rows.values()]),
      // Also usable directly as the default manager (login()/register()'s
      // issueTokens() call uses `this.refreshSessions.manager` with no
      // transaction wrapping — a plain write, nothing to serialize).
      manager: fakeManager,
    };
    // Faithfully simulates real TypeORM's rollback-on-throw (see
    // node_modules/typeorm/entity-manager/EntityManager.js's transaction()):
    // if the callback rejects, every write it made must NOT persist. Without
    // this, a bug where the service throws INSIDE the transaction after a
    // write it needs to keep (exactly what happened before this hardening
    // pass — see refresh()'s doc comment) would be invisible to this mock,
    // since a naive `cb(fakeManager)` mock lets writes "stick" regardless of
    // whether the callback's promise ultimately rejects.
    Object.assign(refreshSessions.manager, {
      transaction: jest.fn(async (cb: any) => {
        const snapshot = new Map(
          [...rows.entries()].map(([id, row]) => [id, { ...row }]),
        );
        try {
          return await cb(fakeManager);
        } catch (error) {
          rows.clear();
          for (const [id, row] of snapshot) rows.set(id, row);
          throw error;
        }
      }),
    });

    service = new AuthService(
      usersService,
      profileService,
      emailVerificationService,
      emailService,
      loginGuardService,
      jwtService,
      configService,
      refreshSessions,
    );
  });

  describe('register', () => {
    it('hashes the password and creates an empty profile', async () => {
      const created = makeUser();
      usersService.createUser.mockResolvedValue(created);

      const { user, tokens } = await service.register(
        {
          email: created.email,
          password: 'plaintext-password',
          name: 'Person',
        },
        {},
      );

      expect(usersService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: created.email }),
      );
      const hashArg = usersService.createUser.mock.calls[0][0].passwordHash;
      expect(await bcrypt.compare('plaintext-password', hashArg)).toBe(true);
      expect(profileService.createEmptyProfile).toHaveBeenCalledWith(
        created.id,
      );
      expect(user).toBe(created);
      expect(tokens.accessToken).toBe('signed.jwt.token');
      expect(tokens.refreshToken).toEqual(expect.any(String));
    });

    it("signs the access token with the user's actual role from the database — never anything client-influenced", async () => {
      const created = makeUser({ role: UserRole.USER });
      usersService.createUser.mockResolvedValue(created);

      await service.register(
        { email: created.email, password: 'plaintext-password' },
        {},
      );

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.USER }),
        expect.anything(),
      );
    });

    /** Production hardening (Batch 10) — matches JwtStrategy's pinned verification algorithm. */
    it('signs the access token with an explicitly pinned algorithm (HS256)', async () => {
      const created = makeUser();
      usersService.createUser.mockResolvedValue(created);

      await service.register(
        { email: created.email, password: 'plaintext-password' },
        {},
      );

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ algorithm: 'HS256' }),
      );
    });

    it('issues and emails a verification OTP', async () => {
      const created = makeUser();
      usersService.createUser.mockResolvedValue(created);

      await service.register(
        { email: created.email, password: 'plaintext-password' },
        {},
      );

      expect(emailVerificationService.issueOtp).toHaveBeenCalledWith(
        created.id,
      );
      expect(emailService.sendVerificationOtpEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: created.email, otp: '123456' }),
      );
    });

    it('still succeeds even if issuing/sending the verification email fails', async () => {
      const created = makeUser();
      usersService.createUser.mockResolvedValue(created);
      emailVerificationService.issueOtp.mockRejectedValueOnce(
        new Error('otp table unavailable'),
      );

      const { user } = await service.register(
        { email: created.email, password: 'plaintext-password' },
        {},
      );

      // Registration itself must not fail — the account and tokens already
      // exist by this point; a resend path covers the failed email later.
      expect(user).toBe(created);
    });
  });

  describe('validateCredentials', () => {
    it('throws on unknown email without revealing whether the account exists', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(
        service.validateCredentials('nobody@example.invalid', 'x'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws on a wrong password', async () => {
      const hash = await bcrypt.hash('correct-password', 4);
      usersService.findByEmail.mockResolvedValue(
        makeUser({ passwordHash: hash }),
      );
      await expect(
        service.validateCredentials('person@example.invalid', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns the user on a correct password', async () => {
      const hash = await bcrypt.hash('correct-password', 4);
      const user = makeUser({ passwordHash: hash });
      usersService.findByEmail.mockResolvedValue(user);
      await expect(
        service.validateCredentials(
          'person@example.invalid',
          'correct-password',
        ),
      ).resolves.toBe(user);
    });
  });

  /**
   * Production hardening (Batch 2) — login() wraps credential validation
   * with the account-scoped brute-force throttle. LoginGuardService itself
   * is mocked here (its own real behavior is covered by
   * login-guard.service.spec.ts) — this suite proves AuthService.login()
   * calls it correctly and in the right order.
   */
  describe('login — account-scoped brute-force integration', () => {
    it('checks the lockout BEFORE attempting credential validation', async () => {
      loginGuardService.assertNotLocked.mockRejectedValueOnce(
        new Error('locked out'),
      );

      await expect(
        service.login('person@example.invalid', 'irrelevant', {}),
      ).rejects.toThrow('locked out');

      expect(usersService.findByEmail).not.toHaveBeenCalled();
    });

    it('records a failure on wrong credentials, and does not record a success', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login('person@example.invalid', 'wrong', {}),
      ).rejects.toThrow(UnauthorizedException);

      expect(loginGuardService.recordFailure).toHaveBeenCalledWith(
        'person@example.invalid',
      );
      expect(loginGuardService.recordSuccess).not.toHaveBeenCalled();
    });

    it('records a success on correct credentials, and does not record a failure', async () => {
      const hash = await bcrypt.hash('correct-password', 4);
      usersService.findByEmail.mockResolvedValue(
        makeUser({ passwordHash: hash }),
      );

      await service.login('person@example.invalid', 'correct-password', {});

      expect(loginGuardService.recordSuccess).toHaveBeenCalledWith(
        'person@example.invalid',
      );
      expect(loginGuardService.recordFailure).not.toHaveBeenCalled();
    });
  });

  describe('refresh token rotation and reuse detection', () => {
    it('rotates: the old token stops working and a new one is issued', async () => {
      const user = makeUser();
      usersService.createUser.mockResolvedValue(user);
      usersService.getByIdOrThrow.mockResolvedValue(user);

      const { tokens: original } = await service.register(
        { email: user.email, password: 'pw' },
        {},
      );

      const { tokens: rotated } = await service.refresh(
        original.refreshToken,
        {},
      );
      expect(rotated.refreshToken).not.toEqual(original.refreshToken);

      // The original token must now be dead.
      await expect(service.refresh(original.refreshToken, {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('replaying a rotated-out token revokes every session for that user, including the current one', async () => {
      const user = makeUser();
      usersService.createUser.mockResolvedValue(user);
      usersService.getByIdOrThrow.mockResolvedValue(user);

      const { tokens: original } = await service.register(
        { email: user.email, password: 'pw' },
        {},
      );
      const { tokens: rotated } = await service.refresh(
        original.refreshToken,
        {},
      );

      // Replay of the pre-rotation token: reuse detected.
      await expect(service.refresh(original.refreshToken, {})).rejects.toThrow(
        /reuse detected/i,
      );

      // The legitimately-rotated token must ALSO now be dead — reuse revokes
      // the whole user, not just the replayed session.
      await expect(service.refresh(rotated.refreshToken, {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('CRITICAL: the reuse-detection "revoke all sessions" write actually persists, despite the transaction ultimately rejecting', async () => {
      // Regression test for a bug found during the Track 1 hardening pass:
      // an earlier version of refresh() threw UnauthorizedException directly
      // inside the transaction callback, AFTER writing the revoke-all sweep
      // — which TypeORM's manager.transaction() then silently rolled back
      // along with everything else, because the callback's promise
      // rejected. The revoke-all write never actually persisted; reuse
      // detection reported success (via the thrown error) while doing
      // nothing. This test only catches that class of bug because the mock
      // above now faithfully rolls back on a rejected callback, matching
      // real TypeORM — see this file's transaction mock comment.
      const user = makeUser();
      usersService.createUser.mockResolvedValue(user);
      usersService.getByIdOrThrow.mockResolvedValue(user);

      const { tokens: original } = await service.register(
        { email: user.email, password: 'pw' },
        {},
      );
      await service.refresh(original.refreshToken, {}); // legitimate rotation

      await expect(
        service.refresh(original.refreshToken, {}), // replay: reuse detected
      ).rejects.toThrow(/reuse detected/i);

      // Directly inspect persisted state — not just "a later call also
      // fails", which could in principle be satisfied a different way.
      const sessions = await refreshSessions.find();
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.every((s: any) => s.revokedAt !== null)).toBe(true);
      expect(sessions.some((s: any) => s.revokedDueToReuse === true)).toBe(
        true,
      );
    });

    it('the expired-token consumption write actually persists, despite the transaction rejecting', async () => {
      const user = makeUser();
      usersService.createUser.mockResolvedValue(user);
      usersService.getByIdOrThrow.mockResolvedValue(user);

      const { tokens: original } = await service.register(
        { email: user.email, password: 'pw' },
        {},
      );
      const [session] = await refreshSessions.find();
      session.expiresAt = new Date(Date.now() - 1000);

      await expect(service.refresh(original.refreshToken, {})).rejects.toThrow(
        /expired/i,
      );

      const [persisted] = await refreshSessions.find();
      expect(persisted.revokedAt).not.toBeNull();
    });

    it('rejects an unknown refresh token outright', async () => {
      await expect(service.refresh('not-a-real-token', {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an expired refresh token, and consumes it so it cannot be tried again', async () => {
      const user = makeUser();
      usersService.createUser.mockResolvedValue(user);
      usersService.getByIdOrThrow.mockResolvedValue(user);

      const { tokens: original } = await service.register(
        { email: user.email, password: 'pw' },
        {},
      );
      // Force the session's expiry into the past directly on the fake table.
      const [session] = await refreshSessions.find();
      session.expiresAt = new Date(Date.now() - 1000);

      await expect(service.refresh(original.refreshToken, {})).rejects.toThrow(
        /expired/i,
      );
      // Trying again must NOT report "reuse" confusingly — it's simply dead
      // now (consumed by the expiry check above), same UnauthorizedException.
      await expect(service.refresh(original.refreshToken, {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('A1.1 — atomic consume: of two concurrent refresh attempts on the SAME token, exactly one succeeds and the other is rejected as reuse', async () => {
      const user = makeUser();
      usersService.createUser.mockResolvedValue(user);
      usersService.getByIdOrThrow.mockResolvedValue(user);

      const { tokens: original } = await service.register(
        { email: user.email, password: 'pw' },
        {},
      );

      // Fired concurrently — neither is awaited before the other starts —
      // to exercise the atomic-conditional-update check in refresh() itself,
      // not just two sequential calls (already covered above). The true
      // atomicity guarantee comes from Postgres serializing concurrent
      // UPDATEs to the same row; this proves the SERVICE code correctly acts
      // on an { affected } count when it IS given one, which is the part a
      // unit test can actually exercise.
      const results = await Promise.allSettled([
        service.refresh(original.refreshToken, {}),
        service.refresh(original.refreshToken, {}),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason.message).toMatch(/reuse detected/i);

      // The originally-presented session (the very first one created, by
      // `register()` before either concurrent refresh call) is
      // unconditionally revoked — for both the winner (as part of normal
      // rotation) and the loser (as part of reuse-handling). This is the
      // core guarantee A1.1 exists for, and it holds regardless of ordering.
      const sessions = await refreshSessions.find();
      const originalSession = sessions.find((s: any) => s.id === 'session-1');
      expect(originalSession.revokedAt).not.toBeNull();

      // A second-order race writing THIS test originally surfaced: without
      // the per-user advisory lock, the loser's "revoke every session for
      // this user" sweep could run before the winner's brand-new session
      // (created downstream of several more awaits) was inserted, letting
      // that new session escape the sweep. The lock closes this by
      // serializing the whole consume-or-revoke-all-and-issue sequence per
      // user — see AuthService.refresh()'s doc comment. This mock's
      // `manager.query()` (the lock acquisition) is a no-op, so it cannot
      // prove the lock's real effect — that guarantee comes from Postgres
      // itself and is out of reach for a unit test (consistent with the
      // standing no-E2E constraint), so it is not asserted here.
    });
  });
});
