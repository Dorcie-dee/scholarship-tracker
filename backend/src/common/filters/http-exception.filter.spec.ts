import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';
import { requestContextStorage } from '../logging/request-context';

/**
 * Production hardening (Batch 10) — proves the response body now carries
 * the current request's correlation id (`null` outside any request
 * context), without changing the pre-existing shape/behavior otherwise.
 */
describe('AllExceptionsFilter', () => {
  const makeHost = () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const response = { status };
    const request = { url: '/some/path' };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;
    return { host, status, json };
  };

  it('includes requestId: null when called outside any request context', () => {
    const filter = new AllExceptionsFilter();
    const { host, json } = makeHost();

    filter.catch(new BadRequestException('bad input'), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: null }),
    );
  });

  it('includes the current request id when one is active', () => {
    const filter = new AllExceptionsFilter();
    const { host, json } = makeHost();

    requestContextStorage.run({ requestId: 'req-xyz-789' }, () => {
      filter.catch(new BadRequestException('bad input'), host);
    });

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-xyz-789' }),
    );
  });

  it('still normalizes to the established { statusCode, message, error, path, timestamp } shape', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = makeHost();

    filter.catch(new BadRequestException('bad input'), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'bad input',
        path: '/some/path',
        timestamp: expect.any(String),
      }),
    );
  });

  it('never leaks internal details for an unexpected (non-HttpException) error', () => {
    const filter = new AllExceptionsFilter();
    const { host, json } = makeHost();

    filter.catch(new Error('a raw driver error with sensitive detail'), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
        error: 'Internal Server Error',
      }),
    );
  });
});
