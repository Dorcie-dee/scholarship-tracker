import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { requestContextStorage } from './request-context';

const REQUEST_ID_HEADER = 'x-request-id';

/** Conservative allowlist — a real request id (ours or an upstream proxy's) is always alphanumeric/hyphen and short; anything else is treated as untrusted input, not logged or echoed back verbatim. */
const VALID_REQUEST_ID = /^[A-Za-z0-9-]{1,100}$/;

/**
 * Production hardening (Batch 10) — assigns every request a correlation id
 * (reusing an upstream one from `X-Request-Id` if a reverse proxy/API
 * gateway already set one and it looks well-formed; generating a fresh
 * `crypto.randomUUID()` otherwise), stores it in `AsyncLocalStorage` for the
 * lifetime of the request (see request-context.ts), and echoes it back on
 * the response — so a client-reported issue can be matched to server-side
 * log lines by this one value.
 *
 * Registered first, ahead of every other middleware/guard/interceptor (see
 * app.module.ts's `configure()`), so the id is available for the entire
 * request lifecycle, including anything that runs before a controller
 * (guards, the global ValidationPipe, the exception filter).
 *
 * A malformed/oversized incoming header is never trusted or echoed back
 * verbatim — a client can't use this to inject arbitrary content into log
 * lines (e.g. embedded newlines forging fake log entries) or otherwise
 * abuse an unbounded string; a fresh id is generated instead, silently.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(REQUEST_ID_HEADER);
    const requestId =
      incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();

    res.setHeader('X-Request-Id', requestId);
    requestContextStorage.run({ requestId }, () => next());
  }
}
