import { z } from 'zod';
import { EMAIL_MAX_LENGTH } from '../lib/text-limits';

/**
 * Zod schemas for the `/api/auth/*` routes — ported from the NestJS
 * backend's `auth/dto/*.ts` + `auth/password-policy.ts`. Every object schema
 * is `.strict()` so an unknown field is REJECTED (400), matching the
 * original's global `ValidationPipe({ whitelist: true, forbidNonWhitelisted:
 * true })` exactly, rather than silently stripped.
 */

// --- Password policy (auth/password-policy.ts) --------------------------

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * bcrypt (and bcryptjs) silently ignores any input bytes beyond 72 — this is
 * inherent to bcrypt's Blowfish-based design. A password measured in
 * *characters* can exceed 72 *bytes* well before PASSWORD_MAX_LENGTH (128)
 * once multi-byte UTF-8 characters are involved, which would mean trailing
 * bytes are silently dropped from what bcrypt actually hashes. Rejected
 * outright with a clear validation error instead — see the original's
 * `password-policy.ts` doc comment ("Password policy and bcrypt's 72-byte
 * limit").
 */
export const PASSWORD_MAX_BYTES = 72;

export function isWithinBcryptByteLimit(password: string): boolean {
  return Buffer.byteLength(password, 'utf8') <= PASSWORD_MAX_BYTES;
}

const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`)
  .max(PASSWORD_MAX_LENGTH)
  .refine(isWithinBcryptByteLimit, {
    message: `Password must be at most ${PASSWORD_MAX_BYTES} bytes once UTF-8 encoded (roughly ${PASSWORD_MAX_BYTES} characters for plain text, fewer if it contains accents, emoji, or non-Latin characters)`,
  });

const emailSchema = z.string().email().max(EMAIL_MAX_LENGTH);

// --- DTO equivalents -----------------------------------------------------

export const registerSchema = z
  .object({
    email: emailSchema,
    password: newPasswordSchema,
    name: z.string().max(255).optional(),
  })
  .strict();
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z
  .object({
    email: emailSchema,
    // Deliberately no MinLength/byte-limit check here, matching the
    // original LoginDto — those checks exist to warn a user AT REGISTRATION
    // TIME that their password is ambiguous, not to re-validate a login
    // attempt; only the length cap matters here, to reject a grossly
    // oversized payload before it ever reaches bcrypt.
    password: z.string().max(PASSWORD_MAX_LENGTH),
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z
  .object({
    code: z.string().length(6, 'Verification code must be exactly 6 digits'),
  })
  .strict();
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const forgotPasswordSchema = z
  .object({
    email: emailSchema,
  })
  .strict();
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    // PasswordResetService always issues exactly 64 hex characters
    // (`generateOpaqueToken(32)` -> 32 bytes -> 64 hex chars) — any other
    // length is definitely not a real token.
    token: z.string().length(64, 'token must be a 64-character hex string'),
    newPassword: newPasswordSchema,
  })
  .strict();
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
