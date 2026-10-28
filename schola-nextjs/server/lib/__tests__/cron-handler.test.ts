import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { withCronRoute } from '../cron-handler';
import { ok } from '../response';
import { resetConfigCache } from '../config';

function makeRequest(authHeader?: string): NextRequest {
  return new NextRequest('http://localhost/api/cron/test', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : undefined,
  });
}

const SECRET = 'a-real-cron-secret-that-is-reasonably-long';

describe('withCronRoute', () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    resetConfigCache();
  });

  it('rejects with 401 when CRON_SECRET is not configured, even with a presented secret', async () => {
    delete process.env.CRON_SECRET;
    resetConfigCache();
    const handler = withCronRoute(async () => ok({ ran: true }));

    const res = await handler(makeRequest('Bearer anything'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toMatch(/not configured/i);
  });

  it('rejects with 401 when no Authorization header is presented', async () => {
    process.env.CRON_SECRET = SECRET;
    resetConfigCache();
    const handler = withCronRoute(async () => ok({ ran: true }));

    const res = await handler(makeRequest());
    expect(res.status).toBe(401);
  });

  it('rejects with 401 when the presented secret is wrong', async () => {
    process.env.CRON_SECRET = SECRET;
    resetConfigCache();
    const handler = withCronRoute(async () => ok({ ran: true }));

    const res = await handler(makeRequest('Bearer not-the-right-secret'));
    expect(res.status).toBe(401);
  });

  it('rejects a presented secret that only differs in length (no early-exit shortcut)', async () => {
    process.env.CRON_SECRET = SECRET;
    resetConfigCache();
    const handler = withCronRoute(async () => ok({ ran: true }));

    const res = await handler(makeRequest(`Bearer ${SECRET}-extra`));
    expect(res.status).toBe(401);
  });

  it('calls the handler and returns its response when the secret matches exactly', async () => {
    process.env.CRON_SECRET = SECRET;
    resetConfigCache();
    let called = false;
    const handler = withCronRoute(async () => {
      called = true;
      return ok({ ran: true });
    });

    const res = await handler(makeRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(called).toBe(true);
    const body = await res.json();
    expect(body).toEqual({ ran: true });
  });

  it('sets X-Request-Id on both success and error responses', async () => {
    process.env.CRON_SECRET = SECRET;
    resetConfigCache();
    const okHandler = withCronRoute(async () => ok({ ran: true }));
    const okRes = await okHandler(makeRequest(`Bearer ${SECRET}`));
    expect(okRes.headers.get('X-Request-Id')).toBeTruthy();

    const errRes = await okHandler(makeRequest('Bearer wrong'));
    expect(errRes.headers.get('X-Request-Id')).toBeTruthy();
  });
});
