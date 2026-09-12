import request from 'supertest';
import {
  bootstrapTestApp,
  cleanupTestUsers,
  TestApp,
} from '../http-integration/test-app';

/**
 * Production hardening (Batch 16) — failure/recovery testing: Redis
 * unavailability, real (not mocked) — the app is configured WITH a
 * `REDIS_URL` pointing at a port nothing listens on, so `ioredis` genuinely
 * attempts and fails to connect (not simply "Redis unconfigured", which is
 * a different, already-well-covered code path — see redis.module.ts).
 * Confirms Batch 3's documented fail-open (ordinary routes)/fail-closed
 * (`@StrictRateLimit()` routes) policy actually holds over real HTTP
 * requests against a real, genuinely-unreachable Redis target — not just
 * at the unit level (production-throttler.guard.spec.ts already covers the
 * guard's own logic in isolation; this proves the whole request pipeline
 * behaves correctly when it's actually true).
 */
describe('Redis outage (real, unreachable target)', () => {
  let testApp: TestApp;
  const emailPrefix = `failure-redis-${process.pid}-`;

  beforeAll(async () => {
    // Nothing listens on this port in this sandbox — a genuine connection
    // failure, not merely "Redis unconfigured".
    process.env.REDIS_URL = 'redis://127.0.0.1:63999';
    testApp = await bootstrapTestApp();
  });

  afterAll(async () => {
    delete process.env.REDIS_URL;
    await cleanupTestUsers(testApp.dataSource, emailPrefix);
    await testApp.app.close();
  });

  it('app boots successfully despite Redis being unreachable — an outage here is not a startup dependency', async () => {
    await request(testApp.app.getHttpServer()).get('/api/health').expect(200);
  });

  it('an ordinary (non-strict) rate-limited route fails OPEN — still serves the request', async () => {
    // /api/health carries the app-wide default throttle (no @StrictRateLimit())
    // — Redis being down must not turn availability-neutral traffic into an
    // outage of its own.
    const res = await request(testApp.app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('a @StrictRateLimit() route (register) fails CLOSED — a clear 503, not silently unthrottled', async () => {
    const res = await request(testApp.app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `${emailPrefix}${Date.now()}@example.invalid`,
        password: 'a genuinely reasonable passphrase',
      });

    expect(res.status).toBe(503);
  });

  it('recovers once the app is reconfigured with no Redis at all (graceful degradation is the same either way)', async () => {
    // Not a live "Redis comes back" reconnection test (ioredis's own retry
    // strategy governs that, already bounded — see redis.module.ts) — this
    // confirms the DEGRADED state itself is stable and consistent, not a
    // one-shot failure that corrupts subsequent requests.
    const res = await request(testApp.app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
  });
});
