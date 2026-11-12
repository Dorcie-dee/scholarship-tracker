import { createTransport, type Transporter } from 'nodemailer';
import { getConfig } from './config';

/**
 * Email delivery — ported from the NestJS backend's `common/email/*`. The
 * one boundary between auth (OTP/password-reset) and actual delivery:
 * nothing outside this file constructs email content or knows which
 * transport is in use.
 *
 * Provider selection:
 *  - `EMAIL_SMTP_HOST` set -> real SMTP delivery (SES, SendGrid, Postmark,
 *    Mailgun, a corporate relay — all speak SMTP).
 *  - Not set, non-production -> logs the message (clearly marked as not
 *    actually sent) so a developer can read an OTP/reset link locally.
 *  - Not set, production -> throws at first send (fail loud, not silent).
 */

interface EmailParams {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const SMTP_CONNECTION_TIMEOUT_MS = 10_000;
const SMTP_GREETING_TIMEOUT_MS = 10_000;
const SMTP_SOCKET_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let cachedTransporter: { transporter: Pick<Transporter, 'sendMail'>; from: string } | null = null;

function getTransporter(): { transporter: Pick<Transporter, 'sendMail'>; from: string } | null {
  if (cachedTransporter) return cachedTransporter;

  const { email, isProduction } = getConfig();
  if (!email.smtpHost) {
    if (isProduction) {
      throw new Error(
        'EMAIL_SMTP_HOST is not set. Email delivery cannot run in production without a real SMTP provider configured.',
      );
    }
    return null; // dev log transport — see sendViaProviderOrLog()
  }

  if (Number.isNaN(email.smtpPort)) {
    throw new Error('EMAIL_SMTP_PORT is not a valid number. Check its value in .env.local.');
  }
  if (Boolean(email.smtpUser) !== Boolean(email.smtpPassword)) {
    throw new Error(
      'EMAIL_SMTP_USER and EMAIL_SMTP_PASSWORD must be set together (or both left unset for an unauthenticated relay).',
    );
  }

  const transporter = createTransport({
    host: email.smtpHost,
    port: email.smtpPort,
    secure: email.smtpSecure,
    auth: email.smtpUser ? { user: email.smtpUser, pass: email.smtpPassword } : undefined,
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
  });
  cachedTransporter = { transporter, from: `"${email.fromName}" <${email.fromAddress}>` };
  return cachedTransporter;
}

async function sendOnce(
  transporter: Pick<Transporter, 'sendMail'>,
  from: string,
  params: EmailParams,
): Promise<void> {
  await transporter.sendMail({ from, to: params.to, subject: params.subject, text: params.text, html: params.html });
}

async function sendViaProviderOrLog(params: EmailParams): Promise<void> {
  const configured = getTransporter();
  if (!configured) {
    // eslint-disable-next-line no-console
    console.warn(
      `[DEV EMAIL — NOT ACTUALLY SENT] To: ${params.to} | Subject: ${params.subject}\n${params.text}`,
    );
    return;
  }

  const { transporter, from } = configured;
  try {
    await sendOnce(transporter, from, params);
    return;
  } catch (firstError) {
    // eslint-disable-next-line no-console
    console.warn(
      `SMTP delivery attempt 1 failed for a message to ${params.to} — retrying once: ${
        firstError instanceof Error ? firstError.message : 'unknown error'
      }`,
    );
  }

  try {
    await delay(RETRY_DELAY_MS);
    await sendOnce(transporter, from, params);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `SMTP delivery failed for a message to ${params.to} (both attempts): ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
    throw new Error('Failed to send email');
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrapHtml(bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:sans-serif;line-height:1.5;color:#1a1a1a;max-width:480px;margin:0 auto;padding:24px">${bodyHtml}<p style="color:#666;font-size:12px;margin-top:32px">If you didn't request this, you can safely ignore this email.</p></body></html>`;
}

export async function sendVerificationOtpEmail(params: {
  to: string;
  otp: string;
  expiresAt: Date;
}): Promise<void> {
  const { appUrl } = getConfig();
  const verifyUrl = `${appUrl}/verify-email`;
  const expiresLocal = params.expiresAt.toISOString();
  await sendViaProviderOrLog({
    to: params.to,
    subject: 'Verify your Schola account',
    text:
      `Your verification code is: ${params.otp}\n\n` +
      `This code expires at ${expiresLocal}.\n\n` +
      `You can also verify at: ${verifyUrl}`,
    html: wrapHtml(
      `<h2>Verify your account</h2>` +
        `<p>Your verification code is:</p>` +
        `<p style="font-size:28px;font-weight:bold;letter-spacing:4px">${escapeHtml(params.otp)}</p>` +
        `<p>This code expires at ${escapeHtml(expiresLocal)}.</p>` +
        `<p><a href="${escapeHtml(verifyUrl)}">Verify your account</a></p>`,
    ),
  });
}

export async function sendPasswordResetEmail(params: {
  to: string;
  rawToken: string;
  expiryMinutes: number;
}): Promise<void> {
  const { appUrl } = getConfig();
  const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(params.rawToken)}`;
  await sendViaProviderOrLog({
    to: params.to,
    subject: 'Reset your Schola password',
    text:
      `We received a request to reset your password.\n\n` +
      `Reset it here: ${resetUrl}\n\n` +
      `This link expires in ${params.expiryMinutes} minutes.`,
    html: wrapHtml(
      `<h2>Reset your password</h2>` +
        `<p>We received a request to reset your password.</p>` +
        `<p><a href="${escapeHtml(resetUrl)}">Reset your password</a></p>` +
        `<p>This link expires in ${params.expiryMinutes} minutes.</p>`,
    ),
  });
}

/** Test-only: force the next send to re-resolve the transporter (e.g. after changing env vars). */
export function resetEmailTransporterCache(): void {
  cachedTransporter = null;
}
