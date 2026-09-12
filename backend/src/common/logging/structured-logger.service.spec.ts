import { StructuredLoggerService } from './structured-logger.service';
import { requestContextStorage } from './request-context';

/**
 * Production hardening (Batch 10) — proves the two distinct output modes:
 * structured JSON in production (what a log aggregator actually needs),
 * delegated-to-ConsoleLogger everywhere else (what a developer's terminal
 * actually needs) — and that the current request's correlation id reaches
 * both.
 */
describe('StructuredLoggerService', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  describe('in production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('emits a single structured JSON line per log call', () => {
      const writeSpy = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);
      const logger = new StructuredLoggerService();

      logger.log('something happened', 'SomeService');

      expect(writeSpy).toHaveBeenCalledTimes(1);
      const line = JSON.parse((writeSpy.mock.calls[0][0] as string).trim());
      expect(line).toMatchObject({
        level: 'log',
        context: 'SomeService',
        message: 'something happened',
        requestId: null,
      });
      expect(line.timestamp).toEqual(expect.any(String));
    });

    it('includes the current request id when called inside a request context', () => {
      const writeSpy = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);
      const logger = new StructuredLoggerService();

      requestContextStorage.run({ requestId: 'req-abc-123' }, () => {
        logger.log('inside a request', 'SomeService');
      });

      const line = JSON.parse((writeSpy.mock.calls[0][0] as string).trim());
      expect(line.requestId).toBe('req-abc-123');
    });

    it('error() with a (message, trace, context) call includes the stack', () => {
      const writeSpy = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);
      const logger = new StructuredLoggerService();

      logger.error('it broke', 'stack trace here', 'SomeService');

      const line = JSON.parse((writeSpy.mock.calls[0][0] as string).trim());
      expect(line).toMatchObject({
        level: 'error',
        context: 'SomeService',
        message: 'it broke',
        stack: 'stack trace here',
      });
    });

    /**
     * Regression test — a real startup failure once serialized as
     * `"message":{}` here: Nest's own internal exception handler calls
     * `logger.error(exception)` with a single argument, and the error
     * object it passes doesn't always satisfy `instanceof Error` from this
     * module's perspective (module boundaries, framework-internal error
     * classes). `JSON.stringify` silently drops a real `Error`'s
     * `message`/`stack` (non-enumerable), producing an empty, useless log
     * line — exactly the bug the duck-typed extraction in
     * `extractMessageAndStack()` exists to avoid.
     */
    it('extracts message/stack from an error-shaped object even when it fails an instanceof Error check', () => {
      const writeSpy = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);
      const logger = new StructuredLoggerService();

      // Not `new Error(...)` — a plain object with the same shape, simulating
      // an error that crosses a module/realm boundary and fails instanceof.
      const errorLike = {
        message: 'EMAIL_SMTP_HOST is not set.',
        stack: 'Error: EMAIL_SMTP_HOST is not set.\n    at ...',
      };

      // Nest's exception handler calls error() with exactly one argument.
      logger.error(errorLike);

      const line = JSON.parse((writeSpy.mock.calls[0][0] as string).trim());
      expect(line.message).toBe('EMAIL_SMTP_HOST is not set.');
      expect(line.stack).toContain('EMAIL_SMTP_HOST is not set.');
    });

    it('never produces an empty {} message for a real thrown Error, single-argument call', () => {
      const writeSpy = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);
      const logger = new StructuredLoggerService();

      logger.error(new Error('a real startup failure'));

      const line = JSON.parse((writeSpy.mock.calls[0][0] as string).trim());
      expect(line.message).toBe('a real startup failure');
      expect(line.message).not.toEqual({});
    });
  });

  describe('outside production (development/test)', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
    });

    it('delegates to ConsoleLogger rather than writing raw JSON', () => {
      const writeSpy = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);
      const logger = new StructuredLoggerService();

      logger.log('a dev-mode message', 'SomeService');

      // ConsoleLogger writes via process.stdout.write internally too, but
      // never as a single parseable JSON object — the point is *which*
      // formatter ran, not that stdout stayed untouched.
      const calls = writeSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((line) => line.trim().startsWith('{'))).toBe(false);
    });
  });
});
