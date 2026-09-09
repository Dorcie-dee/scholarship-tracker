import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Shared password policy — used by both RegisterDto and ResetPasswordDto so
 * registration and reset can never silently drift apart (spec: "consistent
 * policy for registration and reset").
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * bcrypt (and bcryptjs, which implements the same algorithm — see
 * docs/decisions.md, "bcryptjs instead of bcrypt") silently ignores any input
 * bytes beyond 72 — this is inherent to bcrypt's Blowfish-based design, not a
 * bug in this library. A password measured in *characters* can exceed 72
 * *bytes* well before PASSWORD_MAX_LENGTH (128) once multi-byte UTF-8
 * characters are involved (accents, emoji, non-Latin scripts), which would
 * mean the trailing bytes are silently dropped from what bcrypt actually
 * hashes — e.g. two different passwords that agree on their first 72 bytes
 * could hash identically. We reject that case outright with a clear
 * validation error instead of allowing a password whose real security
 * boundary the user can't see. See docs/decisions.md, "Password policy and
 * bcrypt's 72-byte limit".
 */
export const PASSWORD_MAX_BYTES = 72;

export function isWithinBcryptByteLimit(password: string): boolean {
  return Buffer.byteLength(password, 'utf8') <= PASSWORD_MAX_BYTES;
}

/** class-validator decorator enforcing the byte-limit above. */
export function IsWithinBcryptByteLimit(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isWithinBcryptByteLimit',
      target: object.constructor,
      propertyName,
      options: {
        message: `Password must be at most ${PASSWORD_MAX_BYTES} bytes once UTF-8 encoded (roughly ${PASSWORD_MAX_BYTES} characters for plain text, fewer if it contains accents, emoji, or non-Latin characters)`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && isWithinBcryptByteLimit(value);
        },
      },
    });
  };
}
