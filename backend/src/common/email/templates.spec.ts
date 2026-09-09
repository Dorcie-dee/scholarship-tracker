import { renderPasswordResetEmail, renderVerificationEmail } from './templates';

describe('email templates', () => {
  describe('renderVerificationEmail', () => {
    it('includes the code, expiry, and verify URL in the text body', () => {
      const expiresAt = new Date('2026-01-01T00:10:00.000Z');
      const content = renderVerificationEmail({
        otp: '482913',
        expiresAt,
        verifyUrl: 'https://app.scholarship-os.example/verify-email',
      });

      expect(content.text).toContain('482913');
      expect(content.text).toContain(expiresAt.toISOString());
      expect(content.text).toContain(
        'https://app.scholarship-os.example/verify-email',
      );
    });

    it('HTML-escapes untrusted-looking content rather than injecting it raw', () => {
      const content = renderVerificationEmail({
        otp: '<script>alert(1)</script>',
        expiresAt: new Date(),
        verifyUrl: 'https://example.invalid/verify?x="><script>',
      });

      expect(content.html).not.toContain('<script>alert(1)</script>');
      expect(content.html).not.toContain('"><script>');
    });
  });

  describe('renderPasswordResetEmail', () => {
    it('includes the reset URL (which carries the token) and expiry minutes', () => {
      const content = renderPasswordResetEmail({
        resetUrl:
          'https://app.scholarship-os.example/reset-password?token=abc123',
        expiryMinutes: 30,
      });

      expect(content.text).toContain(
        'https://app.scholarship-os.example/reset-password?token=abc123',
      );
      expect(content.text).toContain('30 minutes');
      expect(content.html).toContain('abc123');
    });
  });
});
