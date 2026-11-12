import { RateLimitCounter, type RateLimitCounterDoc } from '../models/rate-limit-counter.model';
import { ServiceUnavailableError, TooManyRequestsError } from './http-errors';
import { getConfig } from './config';

async function increment(key: string, windowSeconds: number): Promise<number> {
  const now = new Date();

  // Expired (or never-swept-yet) counter -> reset to 1 for a fresh window.
  const reset = await RateLimitCounter.findOneAndUpdate(
    { key, resetAt: { $lte: now } },
    { $set: { count: 1, resetAt: new Date(now.getTime() + windowSeconds * 1000) } },
    { new: true },
  );
  if (reset) return reset.count;

  // Still within an active window (or doesn't exist yet) -> atomic increment/create.
  const incremented = await RateLimitCounter.findOneAndUpdate(
    { key },
    {
      $inc: { count: 1 },
      $setOnInsert: { resetAt: new Date(now.getTime() + windowSeconds * 1000) },
    },
    { upsert: true, new: true },
  );
  return incremented.count;
}

/**
 * Per-route rate limiting — a MongoDB-backed replacement for the original
 * backend's Redis-backed `@nestjs/throttler`. `strict: true` mirrors
 * `@StrictRateLimit()`: if the counter write itself fails (DB blip), the
 * route fails CLOSED (503) rather than silently going unthrottled, since
 * these are the sensitive auth/mutation routes that decorator covered.
 * Non-strict routes fail OPEN on the same error — a transient DB hiccup must
 * not become "nobody can use the app."
 */
export async function assertNotRateLimited(
  key: string,
  options: { max: number; windowSeconds: number; strict?: boolean },
): Promise<void> {
  let count: number;
  try {
    count = await increment(`ratelimit:${key}`, options.windowSeconds);
  } catch (err) {
    if (options.strict) {
      throw new ServiceUnavailableError(
        'Rate limiting is temporarily unavailable; please try again shortly.',
      );
    }
    return; // fail open
  }
  if (count > options.max) {
    throw new TooManyRequestsError('Too many requests — please slow down.');
  }
}

/**
 * Account-scoped login brute-force throttle — ported from
 * `auth/login-guard.service.ts`. A self-recovering window, never a
 * permanent lock: once `maxAttempts` failures land within `windowSeconds`,
 * further attempts for that (normalized) email are rejected for the rest of
 * that window only. Keyed purely by the submitted email, matching or not, so
 * this mechanism itself never reveals whether an account exists.
 */
export async function assertLoginNotLocked(normalizedEmail: string): Promise<void> {
  const { maxAttempts } = getConfig().auth.loginLockout;
  const key = `ratelimit:login-lockout:${normalizedEmail}`;
  let doc: RateLimitCounterDoc | null;
  try {
    doc = (await RateLimitCounter.findOne({ key }).lean()) as RateLimitCounterDoc | null;
  } catch {
    return; // fail open
  }
  if (doc && doc.resetAt > new Date() && doc.count >= maxAttempts) {
    throw new TooManyRequestsError(
      'Too many failed login attempts for this account. Please try again shortly.',
    );
  }
}

export async function recordLoginFailure(normalizedEmail: string): Promise<void> {
  const { windowSeconds } = getConfig().auth.loginLockout;
  try {
    await increment(`ratelimit:login-lockout:${normalizedEmail}`, windowSeconds);
  } catch {
    // fail open — see assertLoginNotLocked's doc comment.
  }
}

export async function recordLoginSuccess(normalizedEmail: string): Promise<void> {
  try {
    await RateLimitCounter.deleteOne({
      key: `ratelimit:login-lockout:${normalizedEmail}`,
    });
  } catch {
    // best-effort only
  }
}
