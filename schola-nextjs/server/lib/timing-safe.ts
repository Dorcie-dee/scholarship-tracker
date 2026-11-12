import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string comparison for secret-gated routes (`/api/cron/*`,
 * `/api/auth/setup-admin`) — a plain `===` lets an attacker infer how many
 * leading characters they've guessed right from response-time differences.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // `timingSafeEqual` throws on mismatched lengths, and a naive
  // length-check-then-compare short-circuits BEFORE the constant-time
  // comparison for a wrong-length guess — which is itself a timing leak
  // (a wrong-length guess returns near-instantly; a right-length-wrong-
  // content one takes measurably longer). Padding both to the same length
  // and running the real comparison unconditionally first avoids that: the
  // length check below only ever cheaply combines with an already-computed
  // constant-time result, never gates whether that computation happens.
  const length = Math.max(bufA.length, bufB.length, 1);
  const paddedA = Buffer.alloc(length);
  const paddedB = Buffer.alloc(length);
  bufA.copy(paddedA);
  bufB.copy(paddedB);
  const paddedContentsMatch = timingSafeEqual(paddedA, paddedB);
  return paddedContentsMatch && bufA.length === bufB.length;
}
