import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppConfig } from '../../config/configuration';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Production hardening (Batch 16) — closes a real gap this checkpoint's own
 * failure/recovery testing surfaced: the Redis client the factory below
 * creates was never disposed on shutdown, so `app.close()`/
 * `enableShutdownHooks()` (Batch 1) left its connection (and, if Redis was
 * unreachable at the time, its own bounded-but-ongoing reconnect retry
 * loop — see the client's `retryStrategy`) still running, which is exactly
 * what kept a Node process alive past a graceful shutdown in this
 * checkpoint's own test run. In a real container/orchestrator deployment,
 * that means the process wouldn't exit cleanly on SIGTERM and would need to
 * be SIGKILL'd after the orchestrator's grace period — a real, if minor,
 * operational rough edge, not merely a test-harness nuisance. `disconnect()`
 * (not `quit()`) is deliberate: `quit()` assumes a working connection to
 * send its command over and wait for a reply; `disconnect()` immediately
 * tears down the socket and stops the retry strategy regardless of whether
 * Redis is currently reachable — correct and bounded either way.
 */
@Injectable()
export class RedisLifecycleService implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis | null) {}

  onModuleDestroy(): void {
    this.client?.disconnect();
  }
}

/**
 * Production hardening (Batch 3) — a single shared Redis client, used by both
 * the distributed rate-limiter storage and the account-scoped login-lockout
 * counter (see throttler/redis-throttler.storage.ts and
 * auth/login-guard.service.ts). One client, one module, one place that
 * decides what "Redis is configured" means — not duplicated per consumer.
 *
 * `REDIS_URL` unset → the provided value is `null`, not a client that fails
 * every call. Every consumer explicitly handles the `null` case (falling
 * back to safe, documented, single-instance-appropriate behavior — see each
 * consumer's own doc comment) rather than this module pretending a client
 * exists when it doesn't.
 *
 * When a URL IS configured: `maxRetriesPerRequest: 1` means a command fails
 * fast (instead of ioredis's default of queuing/retrying many times) so a
 * consumer's own fail-open/fail-closed policy runs promptly rather than
 * hanging the request while Redis is down. An `error` listener is attached
 * unconditionally — ioredis, like every Node EventEmitter, crashes the
 * process on an unhandled `error` event otherwise; connection errors here
 * are expected and handled by each consumer's own try/catch around the
 * actual command, not by crashing.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<AppConfig, true>,
      ): Redis | null => {
        const { url } = configService.get('redis', { infer: true });
        if (!url) {
          return null;
        }
        const logger = new Logger('RedisClient');
        const client = new Redis(url, {
          maxRetriesPerRequest: 1,
          // Bounded, quick reconnect backoff — never gives up (a long Redis
          // outage should self-heal once Redis returns), but never blocks
          // a caller waiting on a hung reconnect attempt either.
          retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
          lazyConnect: false,
        });
        client.on('error', (error) => {
          logger.warn(`Redis connection error: ${error.message}`);
        });
        client.on('connect', () => {
          logger.log('Redis connected.');
        });
        return client;
      },
    },
    RedisLifecycleService,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
