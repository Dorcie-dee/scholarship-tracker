/**
 * Typed HTTP errors + the error response envelope. Ported from the NestJS
 * backend's `common/filters/http-exception.filter.ts` — same shape:
 * `{ statusCode, message, error, path, timestamp, requestId }`, plus an
 * `X-Request-Id` response header carrying the same value, so existing
 * frontend error-handling code (`friendlyApiMessage()`) needs no changes.
 */

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly error: string = httpErrorName(statusCode),
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function httpErrorName(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'Bad Request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not Found';
    case 409:
      return 'Conflict';
    case 422:
      return 'Unprocessable Entity';
    case 429:
      return 'Too Many Requests';
    case 503:
      return 'Service Unavailable';
    default:
      return 'Internal Server Error';
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad request') {
    super(400, message);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') {
    super(401, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden') {
    super(403, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found') {
    super(404, message);
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'Conflict') {
    super(409, message);
  }
}

export class TooManyRequestsError extends HttpError {
  constructor(message = 'Too many requests') {
    super(429, message);
  }
}

export class ServiceUnavailableError extends HttpError {
  constructor(message = 'Service unavailable') {
    super(503, message);
  }
}

export interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
  requestId: string;
}

export function buildErrorBody(
  err: unknown,
  path: string,
  requestId: string,
): ErrorBody {
  if (err instanceof HttpError) {
    return {
      statusCode: err.statusCode,
      message: err.message,
      error: err.error,
      path,
      timestamp: new Date().toISOString(),
      requestId,
    };
  }
  // Unknown/unexpected error — never leak internals (stack trace, driver
  // error text) to the client; the full error is still logged server-side.
  return {
    statusCode: 500,
    message: 'Internal server error',
    error: 'Internal Server Error',
    path,
    timestamp: new Date().toISOString(),
    requestId,
  };
}
