import { ConsoleLogger, LoggerService, LogLevel } from '@nestjs/common';
import { getRequestId } from './request-context';

/**
 * Duck-typed, not `instanceof Error` — Nest's own internal exception
 * handler (`@nestjs/core/errors/exception-handler.js`) and various
 * framework-internal error paths don't always hand this a plain `Error`
 * instance from this process's own `Error` global (module boundaries,
 * custom exception classes, etc. can all produce an error-shaped object
 * that fails a strict `instanceof` check) — confirmed directly: a real
 * startup failure logged through here once serialized as `"message":{}`
 * with `instanceof Error` checks, because `JSON.stringify` silently drops
 * an `Error`'s own `message`/`stack` (non-enumerable by spec) whenever the
 * `instanceof` check fails to catch it. Reading `.message`/`.stack` by
 * simple property presence is robust to exactly that case.
 */
function extractMessageAndStack(value: unknown): {
  message: unknown;
  stack: string | null;
} {
  if (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
  ) {
    const stack = (value as { stack?: unknown }).stack;
    return {
      message: (value as { message: string }).message,
      stack: typeof stack === 'string' ? stack : null,
    };
  }
  return { message: value, stack: null };
}

/**
 * Production hardening (Batch 10) — every log line, everywhere in this app
 * (every `new Logger(SomeClass.name)` call already in use — see
 * auth-cleanup.service.ts, documents.service.ts, etc. — delegates to
 * whatever logger instance `NestFactory.create()` was given, without any
 * per-call-site change needed), now automatically carries the current
 * request's correlation id (see request-context.ts) when one exists.
 *
 * **Structured (JSON) output only in production.** In development/test,
 * this delegates entirely to Nest's own `ConsoleLogger` (the familiar
 * colorized, human-readable format this codebase's local dev/test output
 * already uses) — just with the request id appended to the context, so
 * correlation is visible locally too, without trading away local
 * readability for machine-parseability nobody needs on a laptop. In
 * production, a JSON line per call is what makes this actually useful: log
 * aggregation platforms (CloudWatch, Datadog, ELK, ...) can index/query
 * `requestId`/`level`/`context` directly instead of regex-parsing colorized
 * text meant for a terminal. Verified against a real startup failure (a
 * genuine, pre-existing, production-only fail-fast — see
 * common/email/email.service.ts — deliberately triggered with
 * `NODE_ENV=production` and no SMTP configured), not just a synthetic test.
 */
export class StructuredLoggerService implements LoggerService {
  private readonly devLogger = new ConsoleLogger();
  private readonly isProduction = process.env.NODE_ENV === 'production';

  private decoratedContext(context?: string): string | undefined {
    const requestId = getRequestId();
    if (!requestId) return context;
    return `${context ?? ''}${context ? ' ' : ''}[req:${requestId.slice(0, 8)}]`;
  }

  private writeJson(
    level: LogLevel,
    message: unknown,
    stack: string | null,
    context?: string,
  ): void {
    const extracted = extractMessageAndStack(message);
    process.stdout.write(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        context: context ?? null,
        requestId: getRequestId() ?? null,
        message: extracted.message,
        stack: stack ?? extracted.stack,
      }) + '\n',
    );
  }

  private emit(level: LogLevel, message: unknown, context?: string): void {
    if (!this.isProduction) {
      this.devLogger[level](message, this.decoratedContext(context));
      return;
    }
    this.writeJson(level, message, null, context);
  }

  log(message: unknown, context?: string): void {
    this.emit('log', message, context);
  }

  error(message: unknown, stackOrContext?: string, context?: string): void {
    // Nest's convention: `error(message, trace, context)` when a stack trace
    // is supplied, `error(message, context)` otherwise — mirrored here so
    // every existing `this.logger.error(...)` call site (this codebase's
    // established error-logging pattern) keeps working unmodified. A
    // single-argument call (`logger.error(exception)`, exactly what Nest's
    // own internal exception handler does) also falls through correctly:
    // `stackOrContext`/`context` are both `undefined`, so this lands in the
    // same `emit()` path as every other level, and the actual stack (if any)
    // is recovered from the error object itself by `extractMessageAndStack`.
    if (context !== undefined) {
      if (!this.isProduction) {
        this.devLogger.error(
          message,
          stackOrContext,
          this.decoratedContext(context),
        );
        return;
      }
      this.writeJson('error', message, stackOrContext ?? null, context);
      return;
    }
    this.emit('error', message, stackOrContext);
  }

  warn(message: unknown, context?: string): void {
    this.emit('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.emit('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.emit('verbose', message, context);
  }

  fatal(message: unknown, context?: string): void {
    this.emit('fatal', message, context);
  }
}
