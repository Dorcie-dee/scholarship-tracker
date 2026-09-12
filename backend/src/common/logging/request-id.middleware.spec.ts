import { RequestIdMiddleware } from './request-id.middleware';
import { getRequestId } from './request-context';

/**
 * Production hardening (Batch 10) — proves the middleware establishes a
 * correlation id available to `getRequestId()` for the rest of the request
 * (via AsyncLocalStorage), echoes it on the response, and never trusts an
 * incoming header that doesn't look like a real id.
 */
describe('RequestIdMiddleware', () => {
  const makeReqRes = (headerValue?: string) => {
    const headers: Record<string, string> = {};
    const req: any = { header: jest.fn(() => headerValue) };
    const res: any = {
      setHeader: jest.fn((name: string, value: string) => {
        headers[name] = value;
      }),
    };
    return { req, res, headers };
  };

  it('generates a fresh id when no X-Request-Id header is present', () => {
    const middleware = new RequestIdMiddleware();
    const { req, res, headers } = makeReqRes(undefined);
    let observedInsideRequest: string | undefined;

    middleware.use(req, res, () => {
      observedInsideRequest = getRequestId();
    });

    expect(headers['X-Request-Id']).toEqual(expect.any(String));
    expect(observedInsideRequest).toBe(headers['X-Request-Id']);
  });

  it('reuses a well-formed incoming X-Request-Id header', () => {
    const middleware = new RequestIdMiddleware();
    const incoming = 'upstream-request-id-123';
    const { req, res, headers } = makeReqRes(incoming);

    middleware.use(req, res, () => {});

    expect(headers['X-Request-Id']).toBe(incoming);
  });

  it('discards a malformed/oversized incoming header and generates a fresh id instead', () => {
    const middleware = new RequestIdMiddleware();
    const malicious = `bad\nid\r\ninjected-header: evil`;
    const { req, res, headers } = makeReqRes(malicious);

    middleware.use(req, res, () => {});

    expect(headers['X-Request-Id']).not.toBe(malicious);
    expect(headers['X-Request-Id']).toEqual(expect.any(String));
  });

  it('discards an incoming header over the length allowlist', () => {
    const middleware = new RequestIdMiddleware();
    const tooLong = 'a'.repeat(101);
    const { req, res, headers } = makeReqRes(tooLong);

    middleware.use(req, res, () => {});

    expect(headers['X-Request-Id']).not.toBe(tooLong);
  });

  it('getRequestId() returns undefined outside any request context', () => {
    expect(getRequestId()).toBeUndefined();
  });
});
