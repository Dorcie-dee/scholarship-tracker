import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { AppConfig } from '../config/configuration';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { normalizeEmail } from '../users/users.service';

/**
 * Production hardening (Batch 2) — account-scoped brute-force protection for
 * `POST /auth/login`, additive to the existing IP-based `@Throttle()` on
 * that route. IP throttling alone is insufficient against a distributed
 * (many-IPs, one target account) credential-stuffing attack; this closes
 * that gap by tracking failed attempts per normalized email instead.
 *
 * **Deliberately a THROTTLE, not a hard lock.** A pure "N failures = fully
 * blocked until manual reset" design hands an attacker who merely knows a
 * victim's email address a trivial way to deny that victim service
 * indefinitely — exactly the risk this class was asked to design around. So
 * instead: once `maxAttempts` failures land within `windowSeconds`, further
 * attempts for that email are rejected with a `429` for the REST of that
 * same window — bounded and self-recovering (never longer than
 * `windowSeconds` from the last failure that crossed the threshold), never a
 * permanent or indefinite lock. Combined with IP throttling (which bounds
 * how fast a single attacker can generate failures at all), this raises the
 * cost of both a targeted attack and a distributed one without creating a
 * denial-of-service lever against a legitimate user.
 *
 * **Never reveals account existence.** The counter is keyed purely by the
 * submitted (normalized) email string — an email with no matching account
 * gets its own counter and behaves identically to one that does, so this
 * mechanism itself creates no enumeration signal (on top of `AuthService`'s
 * existing identical-response-shape guarantee for bad credentials).
 *
 * **Shared (Redis) when configured, in-memory otherwise** — matching this
 * project's established pattern (see redis-throttler.storage.ts): a
 * single-instance deployment works correctly either way; only a
 * multi-instance deployment needs the shared store for this protection to
 * see attempts landing on other instances. If Redis is configured but
 * transiently unreachable, this check fails OPEN (logs, doesn't block
 * login) — the same reasoning as `ProductionThrottlerGuard`'s non-strict
 * routes: a Redis blip must not become "nobody can log in."
 */
@Injectable()
export class LoginGuardService {
  private readonly inMemoryAttempts = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  private key(email: string): string {
    return `login-lockout:${normalizeEmail(email)}`;
  }

  /** Throws HttpException(429) if this email is currently throttled. Never throws for any other reason (fails open). */
  async assertNotLocked(email: string): Promise<void> {
    const { maxAttempts } = this.configService.get('auth', {
      infer: true,
    }).loginLockout;
    const count = await this.getCount(email);
    if (count >= maxAttempts) {
      throw new HttpException(
        'Too many failed login attempts for this account. Please try again shortly.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordFailure(email: string): Promise<void> {
    const { windowSeconds } = this.configService.get('auth', {
      infer: true,
    }).loginLockout;
    const key = this.key(email);

    if (this.redis) {
      try {
        const count = await this.redis.incr(key);
        if (count === 1) {
          await this.redis.expire(key, windowSeconds);
        }
      } catch {
        // Fail open — see class doc comment.
      }
      return;
    }

    const now = Date.now();
    const existing = this.inMemoryAttempts.get(key);
    if (!existing || existing.resetAt <= now) {
      this.inMemoryAttempts.set(key, {
        count: 1,
        resetAt: now + windowSeconds * 1000,
      });
    } else {
      existing.count += 1;
    }
  }

  async recordSuccess(email: string): Promise<void> {
    const key = this.key(email);
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch {
        // Fail open — see class doc comment.
      }
      return;
    }
    this.inMemoryAttempts.delete(key);
  }

  private async getCount(email: string): Promise<number> {
    const key = this.key(email);
    if (this.redis) {
      try {
        const value = await this.redis.get(key);
        return value ? Number(value) : 0;
      } catch {
        return 0; // Fail open.
      }
    }
    const existing = this.inMemoryAttempts.get(key);
    if (!existing || existing.resetAt <= Date.now()) {
      return 0;
    }
    return existing.count;
  }
}
