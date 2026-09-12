import {
  RedisThrottlerStorage,
  RedisUnavailableError,
} from './redis-throttler.storage';

/**
 * The Lua script itself (atomic INCR + block-tracking) is proven against
 * real Redis in the concurrency test suite (see
 * test/concurrency/rate-limit.concurrency.spec.ts) — this file covers the
 * contract-shape guarantees a unit test CAN prove: the exact eval() call
 * shape, the storage-record mapping (ms -> s), and the RedisUnavailableError
 * translation ProductionThrottlerGuard depends on.
 */
describe('RedisThrottlerStorage', () => {
  it('calls redis.eval with the documented key/arg shape', async () => {
    const redis = { eval: jest.fn(async () => [1, 60_000, 0, 0]) };
    const storage = new RedisThrottlerStorage(redis as any);

    await storage.increment('client-1', 60_000, 5, 30_000, 'default');

    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      expect.stringContaining('client-1'),
      expect.stringContaining('client-1'),
      60_000,
      5,
      30_000,
      expect.any(Number),
    );
  });

  it('maps a not-blocked result correctly, converting ms fields to seconds', async () => {
    const redis = { eval: jest.fn(async () => [3, 45_000, 0, 0]) };
    const storage = new RedisThrottlerStorage(redis as any);

    const result = await storage.increment(
      'client-1',
      60_000,
      5,
      30_000,
      'default',
    );

    expect(result).toEqual({
      totalHits: 3,
      timeToExpire: 45,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('maps a blocked result correctly', async () => {
    const redis = { eval: jest.fn(async () => [6, 60_000, 1, 30_000]) };
    const storage = new RedisThrottlerStorage(redis as any);

    const result = await storage.increment(
      'client-1',
      60_000,
      5,
      30_000,
      'default',
    );

    expect(result).toEqual({
      totalHits: 6,
      timeToExpire: 60,
      isBlocked: true,
      timeToBlockExpire: 30,
    });
  });

  it('translates a Redis command failure into RedisUnavailableError, never a raw driver error', async () => {
    const redis = {
      eval: jest.fn(async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:6379');
      }),
    };
    const storage = new RedisThrottlerStorage(redis as any);

    await expect(
      storage.increment('client-1', 60_000, 5, 30_000, 'default'),
    ).rejects.toBeInstanceOf(RedisUnavailableError);
  });

  it('scopes the two Redis keys to the same hash tag (Redis Cluster compatibility) and to the throttler name', async () => {
    const redis = { eval: jest.fn(async () => [1, 1000, 0, 0]) };
    const storage = new RedisThrottlerStorage(redis as any);

    await storage.increment('client-1', 60_000, 5, 30_000, 'strict');

    const [, , hitsKey, blockedKey] = redis.eval.mock.calls[0];
    expect(hitsKey).toContain('{client-1}');
    expect(hitsKey).toContain('strict');
    expect(blockedKey).toContain('{client-1}');
    expect(blockedKey).toContain('strict');
  });
});
