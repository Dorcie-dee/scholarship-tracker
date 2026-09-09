import { createHash } from 'crypto';

/**
 * SHA-256 hex digest, used everywhere this codebase stores a high-entropy
 * opaque credential (refresh tokens, email-verification OTPs, password-reset
 * tokens): the raw value is only ever handed to the client once, and only its
 * hash is persisted — a database read alone can never produce a usable
 * credential. See docs/decisions.md, "Refresh token storage".
 */
export const hashToken = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
