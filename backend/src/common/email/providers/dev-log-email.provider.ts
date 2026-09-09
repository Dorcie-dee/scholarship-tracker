import { Logger } from '@nestjs/common';
import { EmailParams, EmailProvider } from '../email-provider.interface';

/**
 * Development/test transport: logs the message instead of sending it, so a
 * developer can read an OTP/reset link locally without any real provider
 * configured. Selected only outside production — see EmailService — so this
 * can never accidentally become the production path.
 *
 * The log line is deliberately prefixed and never emitted at a level that
 * looks like routine operational logging, so it can't be mistaken for a
 * "delivery confirmed" signal — it isn't one.
 */
export class DevLogEmailProvider implements EmailProvider {
  private readonly logger = new Logger('DevLogEmailProvider');

  // eslint-disable-next-line @typescript-eslint/require-await
  async send(params: EmailParams): Promise<void> {
    this.logger.warn(
      `[DEV EMAIL — NOT ACTUALLY SENT] To: ${params.to} | Subject: ${params.subject}\n${params.text}`,
    );
  }
}
