import { describe, expect, it } from 'vitest';
import { User } from '../../models/user.model';
import { ApplicantProfile } from '../../models/applicant-profile.model';
import { RefreshSession } from '../../models/refresh-session.model';
import { EmailVerificationOtp } from '../../models/email-verification-otp.model';
import { hashOpaqueToken } from '../../lib/auth';
import { getConfig } from '../../lib/config';
import { ConflictError, TooManyRequestsError, UnauthorizedError } from '../../lib/http-errors';
import { UserRole } from '../../lib/enums';
import { login, refresh, register } from '../auth.service';
import type { RequestMeta } from '../auth.service';

const meta: RequestMeta = { userAgent: 'vitest', ipAddress: '127.0.0.1' };

describe('auth.service', () => {
  it('register creates a verified=false user + empty profile, issues tokens, and queues a verification OTP', async () => {
    const { user, tokens, pendingOtp } = await register(
      { email: ' Test.User@Example.com ', password: 'CorrectHorse1!' },
      meta,
    );

    expect(user.email).toBe('test.user@example.com'); // normalized: trim + lowercase
    expect(user.isVerified).toBe(false);
    expect(user.role).toBe(UserRole.USER);
    expect(tokens.accessToken).toBeTypeOf('string');
    expect(tokens.refreshToken).toBeTypeOf('string');
    expect(pendingOtp).not.toBeNull();

    const dbUser = await User.findOne({ email: 'test.user@example.com' });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.isVerified).toBe(false);

    const profile = await ApplicantProfile.findOne({ userId: dbUser!._id });
    expect(profile).not.toBeNull();
    expect(profile!.education).toEqual([]);

    const session = await RefreshSession.findOne({ userId: dbUser!._id });
    expect(session).not.toBeNull();
    expect(session!.tokenHash).toBe(hashOpaqueToken(tokens.refreshToken));
    expect(session!.revokedAt).toBeNull();

    const otp = await EmailVerificationOtp.findOne({ userId: dbUser!._id });
    expect(otp).not.toBeNull();
    expect(otp!.consumedAt).toBeNull();
    expect(otp!.otpHash).toBe(hashOpaqueToken(pendingOtp!.otp));
  });

  it('rejects registering an email that already exists (case/whitespace-insensitive)', async () => {
    await register({ email: 'dup@example.com', password: 'CorrectHorse1!' }, meta);

    await expect(
      register({ email: ' DUP@Example.com', password: 'AnotherPassw0rd!' }, meta),
    ).rejects.toThrow(ConflictError);
  });

  it('login succeeds with correct credentials and issues an access token + refresh session', async () => {
    await register({ email: 'login@example.com', password: 'CorrectHorse1!' }, meta);

    const { user, tokens } = await login('login@example.com', 'CorrectHorse1!', meta);

    expect(user.email).toBe('login@example.com');
    expect(tokens.accessToken).toBeTypeOf('string');
    expect(tokens.refreshToken).toBeTypeOf('string');

    const dbUser = await User.findOne({ email: 'login@example.com' });
    const sessions = await RefreshSession.find({ userId: dbUser!._id, revokedAt: null });
    // One session from register(), one from this login().
    expect(sessions).toHaveLength(2);
  });

  it('login fails identically for a wrong password and for a nonexistent email', async () => {
    await register({ email: 'exists@example.com', password: 'CorrectHorse1!' }, meta);

    // Awaited sequentially (not raced via Promise.all) so each rejection is
    // handled as soon as it's produced.
    await expect(login('exists@example.com', 'WrongPassword1!', meta)).rejects.toThrow(
      UnauthorizedError,
    );
    await expect(login('exists@example.com', 'WrongPassword1!', meta)).rejects.toThrow(
      'Invalid email or password',
    );
    await expect(login('nobody@example.com', 'WhateverPassword1!', meta)).rejects.toThrow(
      UnauthorizedError,
    );
    await expect(login('nobody@example.com', 'WhateverPassword1!', meta)).rejects.toThrow(
      'Invalid email or password',
    );
  });

  it('refresh rotates the token and rejects reuse of the old (now-revoked) one', async () => {
    const { tokens } = await register({ email: 'refresh@example.com', password: 'CorrectHorse1!' }, meta);

    const { tokens: rotated } = await refresh(tokens.refreshToken, meta);
    expect(rotated.refreshToken).not.toBe(tokens.refreshToken);
    expect(rotated.accessToken).toBeTypeOf('string');

    // Reusing the original (already-consumed) token must fail...
    await expect(refresh(tokens.refreshToken, meta)).rejects.toThrow(UnauthorizedError);

    // ...and reuse detection must have revoked EVERY session for the user,
    // including the one just rotated to — so it's unusable too now.
    await expect(refresh(rotated.refreshToken, meta)).rejects.toThrow(UnauthorizedError);
  });

  it('rejects a refresh token that was already explicitly revoked (e.g. via logout)', async () => {
    const { tokens } = await register({ email: 'revoked@example.com', password: 'CorrectHorse1!' }, meta);

    const tokenHash = hashOpaqueToken(tokens.refreshToken);
    await RefreshSession.updateOne({ tokenHash }, { $set: { revokedAt: new Date() } });

    await expect(refresh(tokens.refreshToken, meta)).rejects.toThrow(UnauthorizedError);
  });

  it('locks out login after the configured max failed attempts for that account', async () => {
    const { maxAttempts } = getConfig().auth.loginLockout;
    await register({ email: 'lockout@example.com', password: 'CorrectHorse1!' }, meta);

    for (let i = 0; i < maxAttempts; i++) {
      await expect(login('lockout@example.com', 'WrongPassword!', meta)).rejects.toThrow(
        UnauthorizedError,
      );
    }

    // Even the CORRECT password is now rejected for the rest of the window —
    // a throttle, not merely "still wrong credentials".
    await expect(login('lockout@example.com', 'CorrectHorse1!', meta)).rejects.toThrow(
      TooManyRequestsError,
    );
  });
});
