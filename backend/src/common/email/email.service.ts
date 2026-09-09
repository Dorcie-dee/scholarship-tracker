import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { AppConfig } from '../../config/configuration';
import { EmailProvider } from './email-provider.interface';
import { DevLogEmailProvider } from './providers/dev-log-email.provider';
import { SmtpEmailProvider } from './providers/smtp-email.provider';
import { renderPasswordResetEmail, renderVerificationEmail } from './templates';

/**
 * The one boundary between auth (OTP/password-reset) and actual email
 * delivery — see docs/decisions.md, "Email delivery: SMTP, not a vendor SDK".
 * Nothing outside this file (AuthService, EmailVerificationService,
 * PasswordResetService) constructs email content or knows which provider is
 * in use — they call sendVerificationOtpEmail()/sendPasswordResetEmail() and
 * nothing else.
 *
 * Provider selection (see buildProvider()):
 *  - `EMAIL_SMTP_HOST` set → real SMTP delivery (any provider — SES,
 *    SendGrid, Postmark, Mailgun, a corporate relay — all speak SMTP).
 *  - Not set, non-production → DevLogEmailProvider: logs the message
 *    (clearly marked as not actually sent) so a developer can read an
 *    OTP/reset link locally.
 *  - Not set, production → fails at construction time (app startup), not at
 *    first send — same fail-fast posture as JwtStrategy's access-token
 *    secret check. A production deployment silently missing email config
 *    should never start successfully and only be discovered hours later when
 *    the first user tries to register.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly provider: EmailProvider;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    this.provider = this.buildProvider();
  }

  private buildProvider(): EmailProvider {
    const isProduction = this.configService.get('isProduction', {
      infer: true,
    });
    const email = this.configService.get('email', { infer: true });

    if (email.smtpHost) {
      // Configuration-consistency checks — fail loudly at startup rather
      // than producing a confusing SMTP-level auth/connection error at the
      // first send attempt.
      if (Number.isNaN(email.smtpPort)) {
        throw new Error(
          `EMAIL_SMTP_PORT is not a valid number. Check its value in .env.`,
        );
      }
      if (Boolean(email.smtpUser) !== Boolean(email.smtpPassword)) {
        throw new Error(
          'EMAIL_SMTP_USER and EMAIL_SMTP_PASSWORD must be set together ' +
            '(or both left unset for an unauthenticated relay) — only one is currently set.',
        );
      }

      const transporter = createTransport({
        host: email.smtpHost,
        port: email.smtpPort,
        secure: email.smtpSecure,
        auth: email.smtpUser
          ? { user: email.smtpUser, pass: email.smtpPassword }
          : undefined,
      });
      const from = `"${email.fromName}" <${email.fromAddress}>`;
      this.logger.log(
        `Email delivery configured via SMTP (${email.smtpHost}:${email.smtpPort}).`,
      );
      return new SmtpEmailProvider(transporter, from);
    }

    if (isProduction) {
      throw new Error(
        'EMAIL_SMTP_HOST is not set. Email delivery cannot run in production ' +
          'without a real SMTP provider configured — see sample.env.',
      );
    }

    this.logger.warn(
      'EMAIL_SMTP_HOST is not set — using the development log transport. ' +
        'No real email will be sent. See sample.env to configure a real SMTP provider.',
    );
    return new DevLogEmailProvider();
  }

  async sendVerificationOtpEmail(params: {
    to: string;
    otp: string;
    expiresAt: Date;
  }): Promise<void> {
    const frontendUrl = this.configService.get('frontendUrl', { infer: true });
    const content = renderVerificationEmail({
      otp: params.otp,
      expiresAt: params.expiresAt,
      verifyUrl: `${frontendUrl}/verify-email`,
    });
    await this.provider.send({ to: params.to, ...content });
  }

  async sendPasswordResetEmail(params: {
    to: string;
    rawToken: string;
    expiryMinutes: number;
  }): Promise<void> {
    const frontendUrl = this.configService.get('frontendUrl', { infer: true });
    const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(
      params.rawToken,
    )}`;
    const content = renderPasswordResetEmail({
      resetUrl,
      expiryMinutes: params.expiryMinutes,
    });
    await this.provider.send({ to: params.to, ...content });
  }
}
