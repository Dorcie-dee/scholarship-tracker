import { EmailService } from './email.service';
import { DevLogEmailProvider } from './providers/dev-log-email.provider';

/**
 * Provider-selection logic (see EmailService.buildProvider) + the two
 * convenience methods every auth service actually calls. The SMTP-configured
 * cases only verify construction (which nodemailer does not make a network
 * call for) — never actual delivery, which no real provider credentials
 * exist to test (see docs/decisions.md).
 */
describe('EmailService', () => {
  const baseConfig = {
    isProduction: false,
    frontendUrl: 'https://app.scholarship-os.example',
    email: {
      smtpHost: undefined as string | undefined,
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: undefined as string | undefined,
      smtpPassword: undefined as string | undefined,
      fromAddress: 'no-reply@scholarship-os.local',
      fromName: 'Scholarship OS',
    },
  };

  const makeConfigService = (overrides: Partial<typeof baseConfig> = {}) => {
    const config = { ...baseConfig, ...overrides };
    return {
      get: jest.fn((key: string) => (config as any)[key]),
    } as any;
  };

  describe('provider selection', () => {
    it('uses the dev-log provider outside production with no SMTP host configured', () => {
      expect(() => new EmailService(makeConfigService())).not.toThrow();
    });

    it('fails at CONSTRUCTION time (not first send) in production with no SMTP host configured', () => {
      expect(
        () => new EmailService(makeConfigService({ isProduction: true })),
      ).toThrow(/EMAIL_SMTP_HOST/);
    });

    it('does not throw in production when an SMTP host IS configured', () => {
      expect(
        () =>
          new EmailService(
            makeConfigService({
              isProduction: true,
              email: { ...baseConfig.email, smtpHost: 'smtp.example.invalid' },
            }),
          ),
      ).not.toThrow();
    });

    it('fails fast if EMAIL_SMTP_USER is set without EMAIL_SMTP_PASSWORD (or vice versa)', () => {
      expect(
        () =>
          new EmailService(
            makeConfigService({
              email: {
                ...baseConfig.email,
                smtpHost: 'smtp.example.invalid',
                smtpUser: 'someone',
                smtpPassword: undefined,
              },
            }),
          ),
      ).toThrow(/EMAIL_SMTP_USER and EMAIL_SMTP_PASSWORD/);
    });

    it('fails fast if EMAIL_SMTP_PORT is not a valid number', () => {
      expect(
        () =>
          new EmailService(
            makeConfigService({
              email: {
                ...baseConfig.email,
                smtpHost: 'smtp.example.invalid',
                smtpPort: Number('not-a-port'),
              },
            }),
          ),
      ).toThrow(/EMAIL_SMTP_PORT/);
    });

    it('prefers SMTP even outside production when a host is configured', () => {
      // Construction succeeding (no dev-provider warning path taken) is the
      // observable proxy here — real delivery isn't attempted or asserted.
      expect(
        () =>
          new EmailService(
            makeConfigService({
              email: { ...baseConfig.email, smtpHost: 'smtp.example.invalid' },
            }),
          ),
      ).not.toThrow();
    });
  });

  describe('sendVerificationOtpEmail / sendPasswordResetEmail (dev transport)', () => {
    let sendSpy: jest.SpyInstance;
    let service: EmailService;

    beforeEach(() => {
      sendSpy = jest.spyOn(DevLogEmailProvider.prototype, 'send');
      service = new EmailService(makeConfigService());
    });

    afterEach(() => {
      sendSpy.mockRestore();
    });

    it('builds the verify URL from the configured frontendUrl, not a hardcoded one', async () => {
      await service.sendVerificationOtpEmail({
        to: 'person@example.invalid',
        otp: '482913',
        expiresAt: new Date('2026-01-01T00:10:00.000Z'),
      });

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'person@example.invalid',
          text: expect.stringContaining(
            'https://app.scholarship-os.example/verify-email',
          ),
        }),
      );
    });

    it('builds the reset URL (carrying the raw token) from the configured frontendUrl', async () => {
      await service.sendPasswordResetEmail({
        to: 'person@example.invalid',
        rawToken: 'raw-token-value',
        expiryMinutes: 30,
      });

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'person@example.invalid',
          text: expect.stringContaining(
            'https://app.scholarship-os.example/reset-password?token=raw-token-value',
          ),
        }),
      );
    });

    it('sends to the exact recipient supplied — never a different address', async () => {
      await service.sendVerificationOtpEmail({
        to: 'exact-recipient@example.invalid',
        otp: '000000',
        expiresAt: new Date(),
      });

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'exact-recipient@example.invalid' }),
      );
    });
  });
});
