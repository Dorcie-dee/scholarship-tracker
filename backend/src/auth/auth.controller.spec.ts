import { ServiceUnavailableException } from '@nestjs/common';
import { AuthController } from './auth.controller';

/**
 * Direct construction (this codebase's established unit-test convention —
 * never `Test.createTestingModule()`). Covers exactly the two
 * differentiated, documented email-failure policies living in the
 * controller itself (see auth.controller.ts's own comments on each route):
 * `resendVerification()` surfaces a clear 503 when the send fails (the
 * caller is actively, authenticatedly waiting right now), while
 * `forgotPassword()` swallows a send failure (surfacing it would create a
 * response-shape oracle revealing whether an account exists). Previously
 * exercised only indirectly (via a real, deliberately-broken SMTP target in
 * test/failure-recovery/smtp-outage.failure-spec.ts, Batch 16) — this
 * gives both policies direct, fast, reliable unit coverage too.
 */
describe('AuthController — email-failure policies', () => {
  const user = { userId: 'user-1', email: 'person@example.invalid' } as any;

  const makeController = (overrides: {
    emailVerificationService?: any;
    emailService?: any;
    passwordResetService?: any;
  }) =>
    new AuthController(
      {} as any,
      overrides.emailVerificationService ?? {},
      overrides.passwordResetService ?? {},
      overrides.emailService ?? {},
      { get: jest.fn(() => ({ passwordResetExpiryMinutes: 30 })) } as any,
    );

  describe('resendVerification()', () => {
    it('surfaces a clear 503 when the send genuinely fails — the caller is actively waiting', async () => {
      const controller = makeController({
        emailVerificationService: {
          resend: jest.fn(async () => ({
            otp: '123456',
            expiresAt: new Date(),
          })),
        },
        emailService: {
          sendVerificationOtpEmail: jest.fn(async () => {
            throw new Error('SMTP unreachable');
          }),
        },
      });

      await expect(controller.resendVerification(user)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('returns { sent: true } when the send succeeds', async () => {
      const controller = makeController({
        emailVerificationService: {
          resend: jest.fn(async () => ({
            otp: '123456',
            expiresAt: new Date(),
          })),
        },
        emailService: {
          sendVerificationOtpEmail: jest.fn(async () => {}),
        },
      });

      await expect(controller.resendVerification(user)).resolves.toEqual({
        sent: true,
      });
    });
  });

  describe('forgotPassword()', () => {
    it('swallows a send failure — never throws, never reveals delivery success/failure', async () => {
      const controller = makeController({
        passwordResetService: {
          requestReset: jest.fn(async () => ({
            user: { id: 'user-1', email: 'person@example.invalid' },
            rawToken: 'raw-token-value',
          })),
        },
        emailService: {
          sendPasswordResetEmail: jest.fn(async () => {
            throw new Error('SMTP unreachable');
          }),
        },
      });

      await expect(
        controller.forgotPassword({ email: 'person@example.invalid' }),
      ).resolves.toMatchObject({
        message: expect.stringContaining('If an account exists'),
      });
    });

    it('returns the same generic message whether or not an account exists', async () => {
      const controller = makeController({
        passwordResetService: {
          requestReset: jest.fn(async () => null), // no account found
        },
      });

      const result = await controller.forgotPassword({
        email: 'nobody@example.invalid',
      });
      expect(result.message).toContain('If an account exists');
    });
  });
});
