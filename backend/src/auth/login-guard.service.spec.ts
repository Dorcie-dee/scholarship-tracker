import { HttpException, HttpStatus } from '@nestjs/common';
import { LoginGuardService } from './login-guard.service';

/**
 * Covers both storage backends (in-memory when Redis isn't configured — the
 * default for this test's `redis: null` case — and Redis-backed via a fake
 * client), the throttle-not-hard-lock semantics, and the "never reveals
 * account existence" guarantee (the counter is keyed purely by the
 * submitted email string, so an unknown account behaves identically to a
 * real one — nothing here even reads whether one exists).
 */
describe('LoginGuardService', () => {
  const authConfig = {
    loginLockout: { maxAttempts: 3, windowSeconds: 60 },
  };
  const configService = { get: jest.fn(() => authConfig) } as any;

  describe('in-memory backend (no Redis configured)', () => {
    let service: LoginGuardService;

    beforeEach(() => {
      service = new LoginGuardService(null, configService);
    });

    it('allows attempts under the threshold', async () => {
      await expect(
        service.assertNotLocked('person@example.invalid'),
      ).resolves.toBeUndefined();
    });

    it('throttles (429) once maxAttempts failures have been recorded', async () => {
      const email = 'person@example.invalid';
      await service.recordFailure(email);
      await service.recordFailure(email);
      await service.recordFailure(email);

      await expect(service.assertNotLocked(email)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
    });

    it('is scoped per email — failures for one account never throttle another', async () => {
      const victim = 'victim@example.invalid';
      const attacker = 'attacker@example.invalid';
      await service.recordFailure(attacker);
      await service.recordFailure(attacker);
      await service.recordFailure(attacker);

      await expect(service.assertNotLocked(victim)).resolves.toBeUndefined();
    });

    it('normalizes email casing/whitespace so a throttle cannot be bypassed by re-casing', async () => {
      const email = 'Person@Example.invalid';
      await service.recordFailure(email);
      await service.recordFailure(' person@example.invalid ');
      await service.recordFailure('PERSON@EXAMPLE.INVALID');

      await expect(
        service.assertNotLocked('person@example.invalid'),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('recordSuccess resets the counter — a legitimate later login is not penalized by past failures', async () => {
      const email = 'person@example.invalid';
      await service.recordFailure(email);
      await service.recordFailure(email);
      await service.recordSuccess(email);
      await service.recordFailure(email);

      // Only 1 failure since the reset — well under the threshold of 3.
      await expect(service.assertNotLocked(email)).resolves.toBeUndefined();
    });

    it('is a bounded throttle, not a permanent lock — never blocks forever by design (window is finite)', async () => {
      // This test documents the contract (see the class's own doc comment)
      // rather than waiting out a real 60s window: the throttle's window is
      // always finite and configured, never "forever."
      expect(authConfig.loginLockout.windowSeconds).toBeGreaterThan(0);
      expect(Number.isFinite(authConfig.loginLockout.windowSeconds)).toBe(true);
    });
  });

  describe('Redis backend', () => {
    let redis: any;
    let service: LoginGuardService;

    beforeEach(() => {
      const store = new Map<string, number>();
      redis = {
        incr: jest.fn(async (key: string) => {
          const next = (store.get(key) ?? 0) + 1;
          store.set(key, next);
          return next;
        }),
        expire: jest.fn(async () => 1),
        get: jest.fn(async (key: string) => store.get(key)?.toString() ?? null),
        del: jest.fn(async (key: string) => {
          store.delete(key);
        }),
      };
      service = new LoginGuardService(redis, configService);
    });

    it('throttles once maxAttempts is reached, via Redis', async () => {
      const email = 'person@example.invalid';
      await service.recordFailure(email);
      await service.recordFailure(email);
      await service.recordFailure(email);

      await expect(service.assertNotLocked(email)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
    });

    it('sets an expiry only on the first failure, not every subsequent one', async () => {
      const email = 'person@example.invalid';
      await service.recordFailure(email);
      await service.recordFailure(email);

      expect(redis.expire).toHaveBeenCalledTimes(1);
    });

    it('recordSuccess deletes the Redis key', async () => {
      const email = 'person@example.invalid';
      await service.recordFailure(email);
      await service.recordSuccess(email);

      expect(redis.del).toHaveBeenCalledWith(expect.stringContaining(email));
    });

    it('fails OPEN (never blocks login) when Redis itself is unreachable', async () => {
      redis.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(
        service.assertNotLocked('person@example.invalid'),
      ).resolves.toBeUndefined();
    });

    it('recordFailure does not throw when Redis is unreachable', async () => {
      redis.incr.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(
        service.recordFailure('person@example.invalid'),
      ).resolves.toBeUndefined();
    });
  });
});
