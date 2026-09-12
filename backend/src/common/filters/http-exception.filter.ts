import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { getRequestId } from '../logging/request-context';

/**
 * Normalizes every error response (both thrown HttpExceptions and unexpected
 * errors) to a single shape so the frontend can rely on consistent parsing:
 *
 *   { statusCode, message, error, path, timestamp, requestId }
 *
 * Unexpected (non-HttpException) errors are logged with full detail server-side
 * but never leak internals (stack traces, driver errors, etc.) to the client.
 *
 * `requestId` (Production hardening, Batch 10) — the same correlation id
 * this request's log lines carry (see request-context.ts) is now returned
 * to the client too, so a user/support report ("it failed, here's what the
 * app showed me") can be matched directly to server-side logs without
 * needing a timestamp-based guess.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const casted = body as { message?: string | string[]; error?: string };
        message = casted.message ?? exception.message;
        error = casted.error ?? HttpStatus[status];
      }
    } else {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId: getRequestId() ?? null,
    });
  }
}
