import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerRequest } from '@nestjs/throttler/dist/throttler.guard.interface';
import { STRICT_RATE_LIMIT_KEY } from '../decorators/strict-rate-limit.decorator';
import { RedisUnavailableError } from './redis-throttler.storage';

/**
 * Production hardening (Batch 3) — extends the stock `ThrottlerGuard` with
 * one behavior: what to do when the shared rate-limit store itself is
 * unreachable, distinct from an ordinary "this request is over the limit"
 * outcome (`RedisUnavailableError` — see redis-throttler.storage.ts — is the
 * signal distinguishing the two). Only matters when `RedisThrottlerStorage`
 * is actually in use (Redis configured); with the in-memory storage this
 * error type is never thrown, so this guard behaves identically to the
 * stock one.
 *
 * The policy (see `@StrictRateLimit()`'s own doc comment for the full
 * reasoning): a route explicitly marked `@StrictRateLimit()` (login,
 * registration, OTP, password reset, refresh — every endpoint whose rate
 * limit IS a security control) fails CLOSED — a 503, never silently
 * unlimited. Every other route fails OPEN — unthrottled for the outage's
 * duration, so a Redis blip degrades rate limiting, not the whole API.
 */
@Injectable()
export class ProductionThrottlerGuard extends ThrottlerGuard {
  private readonly productionThrottlerLogger = new Logger(
    ProductionThrottlerGuard.name,
  );

  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    try {
      return await super.handleRequest(requestProps);
    } catch (error) {
      if (!(error instanceof RedisUnavailableError)) {
        throw error;
      }

      const isStrict = this.reflector.getAllAndOverride<boolean>(
        STRICT_RATE_LIMIT_KEY,
        [requestProps.context.getHandler(), requestProps.context.getClass()],
      );

      if (isStrict) {
        this.productionThrottlerLogger.error(
          `Rate-limit store unavailable — failing CLOSED for a security-sensitive route: ${error.message}`,
        );
        throw new ServiceUnavailableException(
          'This action is temporarily unavailable. Please try again shortly.',
        );
      }

      this.productionThrottlerLogger.warn(
        `Rate-limit store unavailable — failing OPEN (this request proceeds unthrottled): ${error.message}`,
      );
      return true;
    }
  }
}
