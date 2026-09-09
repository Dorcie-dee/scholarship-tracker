import * as bcrypt from 'bcryptjs';

/**
 * The one place this app hashes/compares passwords — used by both
 * registration and password reset, so there's a single answer to "how do we
 * hash a password here" rather than two independent bcrypt.hash() call sites
 * that could drift.
 */
export function hashPassword(
  password: string,
  saltRounds: number,
): Promise<string> {
  return bcrypt.hash(password, saltRounds);
}

export function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
