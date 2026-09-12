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
/**
 * Production hardening (Batch 11) — a single bounded retry closes the
 * common transient case (a momentary connection blip, an SMTP server's
 * temporary/4xx rejection under brief load) without turning a real,
 * permanent failure (bad credentials, malformed recipient) into unbounded
 * retrying — this is a low-volume, transactional (auth-related) mail path,
 * not a bulk sender, so one unconditional retry is simple, cheap, and safe
 * rather than needing an error-classification scheme to decide when to
 * retry. `RETRY_DELAY_MS` is a short, fixed pause — long enough to let a
 * momentary blip clear, short enough that the total added latency on an
 * already-slow path stays bounded and predictable.
 */
const RETRY_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SmtpEmailProvider implements EmailProvider {
  private readonly logger = new Logger('SmtpEmailProvider');

  constructor(
    private readonly transporter: Pick<Transporter, 'sendMail'>,
    private readonly from: string,
    // Overridable only for tests, so the retry-then-fail path doesn't cost
    // real wall-clock time in the suite — production always uses the
    // module-level default.
    private readonly retryDelayMs: number = RETRY_DELAY_MS,
  ) {}

  private async sendOnce(params: EmailParams): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
  }

  async send(params: EmailParams): Promise<void> {
    try {
      await this.sendOnce(params);
      return;
    } catch (firstError) {
      this.logger.warn(
        `SMTP delivery attempt 1 failed for a message to ${params.to} — retrying once: ${
          firstError instanceof Error ? firstError.message : 'unknown error'
        }`,
      );
    }

    try {
      await delay(this.retryDelayMs);
      await this.sendOnce(params);
    } catch (error) {
      // Log only that delivery failed, never the message body/token — and
      // never the raw provider error object, which can carry SMTP-server
      // internals (hostnames, auth details) not appropriate to surface
      // further up the call stack.
      this.logger.error(
        `SMTP delivery failed for a message to ${params.to} (both attempts): ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new Error('Failed to send email');
    }
  }
}
