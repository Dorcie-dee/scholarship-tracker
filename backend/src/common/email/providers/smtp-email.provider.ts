import { Logger } from '@nestjs/common';
import type { Transporter } from 'nodemailer';
import { EmailParams, EmailProvider } from '../email-provider.interface';

/**
 * The real production transport: plain SMTP via nodemailer, not a
 * vendor-specific SDK — every real provider this app might sit behind (SES,
 * SendGrid, Postmark, Mailgun, a corporate relay) speaks SMTP, so this one
 * implementation works with any of them purely through configuration (see
 * docs/decisions.md, "Email delivery: SMTP, not a vendor SDK").
 *
 * Takes an already-constructed `Transporter` rather than building one itself
 * — keeps this class trivially unit-testable (inject a fake transporter) and
 * keeps credential handling / transport construction in one place
 * (EmailService).
 */
export class SmtpEmailProvider implements EmailProvider {
  private readonly logger = new Logger('SmtpEmailProvider');

  constructor(
    private readonly transporter: Pick<Transporter, 'sendMail'>,
    private readonly from: string,
  ) {}

  async send(params: EmailParams): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html,
      });
    } catch (error) {
      // Log only that delivery failed, never the message body/token — and
      // never the raw provider error object, which can carry SMTP-server
      // internals (hostnames, auth details) not appropriate to surface
      // further up the call stack.
      this.logger.error(
        `SMTP delivery failed for a message to ${params.to}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new Error('Failed to send email');
    }
  }
}
