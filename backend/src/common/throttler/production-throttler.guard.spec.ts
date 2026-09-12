import { ServiceUnavailableException } from '@nestjs/common';
import { ProductionThrottlerGuard } from './production-throttler.guard';
import { RedisUnavailableError } from './redis-throttler.storage';

/**
 * Covers ONLY `ProductionThrottlerGuard`'s own added behavior (the
 * fail-open/fail-closed policy on a `RedisUnavailableError`) — the stock
 * `ThrottlerGuard` logic it extends (limit counting, header setting,
 * `ThrottlerException` on a genuine over-limit) is @nestjs/throttler's own,
 * already-covered-elsewhere responsibility, not re-tested here.
 *
 * Constructed directly (this codebase's established convention) rather than
 * via `Test.createTestingModule` — `onModuleInit()` is called explicitly
 * since that's what a real Nest bootstrap would do before any request
 * reaches `canActivate()`/`handleRequest()`.
 */
describe('ProductionThrottlerGuard', () => {
  const makeContext = () => {
    const req: any = { headers: {} };
    const res: any = { header: jest.fn() };
    return {
      getHandler: jest.fn(() => () => undefined),
      getClass: jest.fn(() => class {}),
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as any;
  };

  const baseRequestProps = (storageService: any, reflector: any) => {
    const guard = new ProductionThrottlerGuard(
      { throttlers: [{ name: 'default', ttl: 60_000, limit: 5 }] },
      storageService,
      reflector,
    );
    return guard;
  };

  it('passes ordinary requests through unchanged (no Redis error)', async () => {
    const storageService = {
      increment: jest.fn(async () => ({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      })),
    };
    const reflector = { getAllAndOverride: jest.fn(() => false) };
    const guard = baseRequestProps(storageService, reflector);
    await guard.onModuleInit();

    const result = await (guard as any).handleRequest({
      context: makeContext(),
      limit: 5,
      ttl: 60_000,
      throttler: { name: 'default' },
      blockDuration: 60_000,
      getTracker: async () => '127.0.0.1',
      generateKey: () => 'key',
    });

    expect(result).toBe(true);
  });

  it('fails OPEN (allows the request) on a Redis outage for a route without @StrictRateLimit()', async () => {
    const storageService = {
      increment: jest.fn(async () => {
        throw new RedisUnavailableError('ECONNREFUSED');
      }),
    };
    const reflector = { getAllAndOverride: jest.fn(() => false) }; // not strict
    const guard = baseRequestProps(storageService, reflector);
    await guard.onModuleInit();

    const result = await (guard as any).handleRequest({
      context: makeContext(),
      limit: 5,
      ttl: 60_000,
      throttler: { name: 'default' },
      blockDuration: 60_000,
      getTracker: async () => '127.0.0.1',
      generateKey: () => 'key',
    });

    expect(result).toBe(true);
  });

  it('fails CLOSED (rejects with 503) on a Redis outage for a @StrictRateLimit() route', async () => {
    const storageService = {
      increment: jest.fn(async () => {
        throw new RedisUnavailableError('ECONNREFUSED');
      }),
    };
    const reflector = { getAllAndOverride: jest.fn(() => true) }; // strict
    const guard = baseRequestProps(storageService, reflector);
    await guard.onModuleInit();

    await expect(
      (guard as any).handleRequest({
        context: makeContext(),
        limit: 5,
        ttl: 60_000,
        throttler: { name: 'default' },
        blockDuration: 60_000,
        getTracker: async () => '127.0.0.1',
        generateKey: () => 'key',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('re-throws any error that is NOT a RedisUnavailableError (e.g. a genuine ThrottlerException) unchanged', async () => {
    const genuineError = new Error('some other failure');
    const storageService = {
      increment: jest.fn(async () => {
        throw genuineError;
      }),
    };
    const reflector = { getAllAndOverride: jest.fn(() => false) };
    const guard = baseRequestProps(storageService, reflector);
    await guard.onModuleInit();

    await expect(
      (guard as any).handleRequest({
        context: makeContext(),
        limit: 5,
        ttl: 60_000,
        throttler: { name: 'default' },
        blockDuration: 60_000,
        getTracker: async () => '127.0.0.1',
        generateKey: () => 'key',
      }),
    ).rejects.toBe(genuineError);
  });
});
