import { SetMetadata } from '@nestjs/common';

export const STRICT_RATE_LIMIT_KEY = 'strictRateLimit';

/**
 * Production hardening (Batch 3) — marks a route as one whose rate limit is
 * itself a security control (login, registration, OTP, password reset,
 * refresh), not merely a fairness/abuse-shedding measure. Read by
 * `ProductionThrottlerGuard` to decide the correct behavior if the shared
 * (Redis) rate-limit store is unreachable: a marked route fails CLOSED (the
 * request is rejected — an attacker must never get unlimited auth attempts
 * just because Redis had a blip); an unmarked route fails OPEN (the request
 * proceeds unthrottled for the outage's duration — a Redis blip must not take
 * the whole API down for ordinary traffic). See
 * common/throttler/production-throttler.guard.ts.
 *
 * Same opt-in metadata shape as `@Public()`/`@Roles()`/`@Throttle()` — read
 * by one guard, no restriction implied for routes that don't use it.
 */
export const StrictRateLimit = () => SetMetadata(STRICT_RATE_LIMIT_KEY, true);
