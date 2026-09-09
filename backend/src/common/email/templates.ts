/**
 * Deliberately plain functions returning {subject, text, html} — not a
 * templating engine/platform. Two emails, each simple enough that a small
 * hand-written function is more legible than a template-file abstraction
 * would be (see docs/decisions.md, "Avoid adding a library without a clear
 * reason").
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapHtml(bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:sans-serif;line-height:1.5;color:#1a1a1a;max-width:480px;margin:0 auto;padding:24px">${bodyHtml}<p style="color:#666;font-size:12px;margin-top:32px">If you didn't request this, you can safely ignore this email.</p></body></html>`;
}

export interface VerificationEmailContent {
  subject: string;
  text: string;
  html: string;
}

/** `verifyUrl` is built from the configured frontend base URL — never hardcoded. */
export function renderVerificationEmail(params: {
  otp: string;
  expiresAt: Date;
  verifyUrl: string;
}): VerificationEmailContent {
  const expiresLocal = params.expiresAt.toISOString();
  return {
    subject: 'Verify your Scholarship OS account',
    text:
      `Your verification code is: ${params.otp}\n\n` +
      `This code expires at ${expiresLocal}.\n\n` +
      `You can also verify at: ${params.verifyUrl}`,
    html: wrapHtml(
      `<h2>Verify your account</h2>` +
        `<p>Your verification code is:</p>` +
        `<p style="font-size:28px;font-weight:bold;letter-spacing:4px">${escapeHtml(params.otp)}</p>` +
        `<p>This code expires at ${escapeHtml(expiresLocal)}.</p>` +
        `<p><a href="${escapeHtml(params.verifyUrl)}">Verify your account</a></p>`,
    ),
  };
}

export function renderPasswordResetEmail(params: {
  resetUrl: string;
  expiryMinutes: number;
}): VerificationEmailContent {
  return {
    subject: 'Reset your Scholarship OS password',
    text:
      `We received a request to reset your password.\n\n` +
      `Reset it here: ${params.resetUrl}\n\n` +
      `This link expires in ${params.expiryMinutes} minutes.`,
    html: wrapHtml(
      `<h2>Reset your password</h2>` +
        `<p>We received a request to reset your password.</p>` +
        `<p><a href="${escapeHtml(params.resetUrl)}">Reset your password</a></p>` +
        `<p>This link expires in ${params.expiryMinutes} minutes.</p>`,
    ),
  };
}
