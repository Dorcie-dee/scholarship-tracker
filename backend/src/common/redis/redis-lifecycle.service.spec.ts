import { RedisLifecycleService } from './redis.module';

/**
 * Production hardening (Batch 16) — proves the shutdown-cleanup gap this
 * checkpoint's own failure/recovery testing surfaced (a Redis client left
 * connecting/reconnecting past `app.close()`, keeping the process alive
 * past a graceful shutdown) is actually closed — see redis.module.ts's doc
 * comment on `RedisLifecycleService` for the full reasoning.
 */
describe('RedisLifecycleService', () => {
  it('disconnects the client on module destroy', () => {
    const client = { disconnect: jest.fn() };
    const service = new RedisLifecycleService(client as any);

    service.onModuleDestroy();

    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  it('is a safe no-op when Redis was never configured (client is null)', () => {
    const service = new RedisLifecycleService(null);

    expect(() => service.onModuleDestroy()).not.toThrow();
  });
});
