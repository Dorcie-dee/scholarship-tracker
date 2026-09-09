import { AuthController } from './auth.controller';

// @nestjs/throttler does NOT re-export THROTTLER_LIMIT/THROTTLER_TTL from its
// public index (confirmed by inspecting node_modules/@nestjs/throttler/dist/
// index.d.ts directly — throttler.constants is never `export *`'d, unlike
// every other internal module) — importing them by name silently resolves to
// `undefined` at runtime rather than failing to compile. Using the literal
// values instead (from throttler.constants.ts: THROTTLER_LIMIT =
// 'THROTTLER:LIMIT', THROTTLER_TTL = 'THROTTLER:TTL') rather than a deep
// dist-path import, which would be fragile across versions.
const THROTTLER_LIMIT = 'THROTTLER:LIMIT';
const THROTTLER_TTL = 'THROTTLER:TTL';

/**
 * Track 1 hardening pass, §2 — verifies the EXACT metadata ThrottlerGuard
 * itself reads at runtime (via its injected Reflector — see
 * node_modules/@nestjs/throttler/dist/throttler.guard.js, and
 * throttler.decorator.js's setThrottlerMetadata, which calls
 * `Reflect.defineMetadata(THROTTLER_LIMIT + name, ...)` on the handler
 * function). This is not a re-implementation or a guess at what @Throttle()
 * does — it reads the real, framework-consumed metadata directly off
 * AuthController.prototype, without booting HTTP or a database.
 *
 * What this CANNOT prove: that ThrottlerGuard actually rejects the
 * (N+1)-th request within the window at runtime — that requires a live HTTP
 * server + real request timing, which is E2E territory and explicitly out of
 * scope. See docs/decisions.md, "Rate-limiting verification boundary".
 */
describe('AuthController — rate-limit configuration', () => {
  const metadataFor = (handlerName: keyof AuthController) => {
    // Read via getOwnPropertyDescriptor rather than a direct property
    // access — this is a metadata lookup, never a call, so there's no
    // `this`-binding concern the unbound-method rule would otherwise
    // (correctly, for a real call site) flag.
    const handler = Object.getOwnPropertyDescriptor(
      AuthController.prototype,
      handlerName,
    )?.value as (...args: unknown[]) => unknown;
    return {
      limit: Reflect.getMetadata(THROTTLER_LIMIT + 'default', handler) as
        number | undefined,
      ttl: Reflect.getMetadata(THROTTLER_TTL + 'default', handler) as
        number | undefined,
    };
  };

  it.each([
    ['register', 10, 60_000],
    ['login', 5, 60_000],
    ['refresh', 20, 60_000],
    ['verifyEmail', 10, 60_000],
    ['resendVerification', 3, 60_000],
    ['forgotPassword', 3, 900_000],
    ['resetPassword', 5, 900_000],
  ] as const)(
    '%s has an explicit @Throttle() limit of %d per %dms',
    (handlerName, expectedLimit, expectedTtl) => {
      const { limit, ttl } = metadataFor(handlerName);
      expect(limit).toBe(expectedLimit);
      expect(ttl).toBe(expectedTtl);
    },
  );

  // logout/logout-all/sessions/me deliberately have no route-specific
  // @Throttle() — they inherit the global default (100/60s, app.module.ts).
  // Asserted explicitly so a future change to this can't silently drift
  // without a test noticing — not a gap, a documented choice (see
  // docs/decisions.md).
  it.each(['logout', 'logoutAll', 'sessions', 'me'] as const)(
    '%s has no route-specific @Throttle() — inherits the global default',
    (handlerName) => {
      const { limit, ttl } = metadataFor(handlerName);
      expect(limit).toBeUndefined();
      expect(ttl).toBeUndefined();
    },
  );

  it('every mutating auth-sensitive endpoint has a route-specific limit strictly tighter than the global default (100/60s)', () => {
    const sensitive = [
      'register',
      'login',
      'verifyEmail',
      'resendVerification',
      'forgotPassword',
      'resetPassword',
    ] as const;
    for (const handlerName of sensitive) {
      const { limit } = metadataFor(handlerName);
      expect(limit).toBeLessThan(100);
    }
  });
});
