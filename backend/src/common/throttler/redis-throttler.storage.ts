import { Inject, Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

/**
 * Thrown when a Redis command genuinely failed (connection error, timeout) —
 * distinguished from an ordinary "you are rate-limited" outcome so
 * `ProductionThrottlerGuard` can tell "Redis is down" apart from "this
 * request is over the limit" and apply the correct per-route fail-open/
 * fail-closed policy (see strict-rate-limit.decorator.ts) instead of
 * treating an infrastructure failure as if it were a legitimate block.
 */
export class RedisUnavailableError extends Error {}

/**
 * Production hardening (Batch 3) — a `ThrottlerStorage` implementation
 * backed by Redis, so every application instance observes the same rate-
 * limit counters (the in-memory default storage is per-process — correct
 * only for a single-instance deployment, see docs/decisions.md,
 * "Distributed rate limiting"). Only constructed/used when `REDIS_URL` is
 * configured — see app.module.ts's `ThrottlerModule.forRootAsync`.
 *
 * **Atomicity**: the increment-and-check-limit sequence is one Lua script
 * (`redis.eval`), executed atomically by Redis's single-threaded command
 * processing — concurrent requests from different instances hitting the
 * same key can never both observe a stale count and both slip under the
 * limit, the exact race a naive "GET, compare, INCR" sequence would allow.
 *
 * Mirrors the in-memory `ThrottlerStorageService`'s exact semantics (same
 * `increment()` contract, same "hits freeze once blocked, unblock only after
 * blockDuration elapses" behavior) so switching between the two (Redis
 * configured or not) changes nothing about how limits actually behave, only
 * whether that behavior is shared across instances.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  // KEYS[1] = hits key, KEYS[2] = blocked-until key
  // ARGV[1] = ttlMs, ARGV[2] = limit, ARGV[3] = blockDurationMs, ARGV[4] = nowMs
  private static readonly INCREMENT_SCRIPT = `
    local hitsKey = KEYS[1]
    local blockedKey = KEYS[2]
    local ttlMs = tonumber(ARGV[1])
    local limit = tonumber(ARGV[2])
    local blockDurationMs = tonumber(ARGV[3])
    local now = tonumber(ARGV[4])

    local blockedUntil = tonumber(redis.call('GET', blockedKey) or '0')
    if blockedUntil > now then
      local hits = tonumber(redis.call('GET', hitsKey) or '0')
      local pttl = redis.call('PTTL', hitsKey)
      if pttl < 0 then pttl = ttlMs end
      return {hits, pttl, 1, blockedUntil - now}
    end

    local hits = redis.call('INCR', hitsKey)
    if hits == 1 then
      redis.call('PEXPIRE', hitsKey, ttlMs)
    end
    local pttl = redis.call('PTTL', hitsKey)
    if pttl < 0 then pttl = ttlMs end

    local isBlocked = 0
    local timeToBlockExpire = 0
    if hits > limit then
      local newBlockedUntil = now + blockDurationMs
      redis.call('SET', blockedKey, newBlockedUntil, 'PX', blockDurationMs)
      isBlocked = 1
      timeToBlockExpire = blockDurationMs
    end

    return {hits, pttl, isBlocked, timeToBlockExpire}
  `;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `throttle:{${key}}:${throttlerName}:hits`;
    const blockedKey = `throttle:{${key}}:${throttlerName}:blocked`;

    let result: [number, number, number, number];
    try {
      result = (await this.redis.eval(
        RedisThrottlerStorage.INCREMENT_SCRIPT,
        2,
        hitsKey,
        blockedKey,
        ttl,
        limit,
        blockDuration,
        Date.now(),
      )) as [number, number, number, number];
    } catch (error) {
      throw new RedisUnavailableError(
        error instanceof Error ? error.message : String(error),
      );
    }

    const [totalHits, timeToExpireMs, isBlocked, timeToBlockExpireMs] = result;
    return {
      totalHits,
      timeToExpire: Math.ceil(timeToExpireMs / 1000),
      isBlocked: isBlocked === 1,
      timeToBlockExpire: Math.ceil(timeToBlockExpireMs / 1000),
    };
  }
}
