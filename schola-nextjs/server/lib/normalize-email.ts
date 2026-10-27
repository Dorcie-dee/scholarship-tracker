/**
 * The single normalization rule for email lookups/storage across this app:
 * trim + lowercase. Ported 1:1 from the NestJS backend's
 * `users/users.service.ts` `normalizeEmail()` — applied at every call site
 * that reads or writes a user's email (register, login, login-lockout
 * keying, forgot-password) so every caller gets consistent behavior.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
