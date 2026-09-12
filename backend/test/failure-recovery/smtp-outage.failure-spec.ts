import request from 'supertest';
import {
  bootstrapTestApp,
  cleanupTestUsers,
  TestApp,
} from '../http-integration/test-app';

/**
 * Production hardening (Batch 16) — failure/recovery testing: SMTP
 * unavailability, real (not mocked). `EMAIL_SMTP_HOST` points at a real
 * TCP port nothing listens on, so `nodemailer`'s SMTP transport genuinely
 * attempts and fails to connect — exercising the real bounded timeouts and
 * real single retry added in Batch 11 (`connectionTimeout`/
 * `SmtpEmailProvider`'s retry-then-fail), not a mocked `sendMail` rejection.
 */
describe('SMTP outage (real, unreachable target)', () => {
  let testApp: TestApp;
  const emailPrefix = `failure-smtp-${process.pid}-`;

  beforeAll(async () => {
    process.env.EMAIL_SMTP_HOST = '127.0.0.1';
    process.env.EMAIL_SMTP_PORT = '63998'; // nothing listens here
    testApp = await bootstrapTestApp();
  });

  afterAll(async () => {
    delete process.env.EMAIL_SMTP_HOST;
    delete process.env.EMAIL_SMTP_PORT;
    await cleanupTestUsers(testApp.dataSource, emailPrefix);
    await testApp.app.close();
  });

  it('registration still succeeds (best-effort email — see auth.service.ts) despite SMTP being completely unreachable, and completes within a bounded time', async () => {
    const start = Date.now();
    const res = await request(testApp.app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `${emailPrefix}${Date.now()}@example.invalid`,
        password: 'a genuinely reasonable passphrase',
      });
    const elapsedMs = Date.now() - start;

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    // Batch 11's bounded connection timeout (10s) + one 500ms-delayed retry
    // caps the worst case well under this — a real, unbounded SMTP hang
    // (nodemailer's own ~2-minute default) would blow well past it.
    expect(elapsedMs).toBeLessThan(25000);
  }, 30000);

  // A second scenario (resend-verification's deliberately-different,
  // surfaced-503 failure policy under a real SMTP outage) was attempted
  // here and dropped: it proved flaky in this harness in a way that traced
  // back to jest `--runInBand` running every *.failure-spec.ts file in one
  // shared Node process (an orphaned background retry/reconnect timer from
  // an earlier file's deliberately-broken client observably interleaved
  // with a later file's request handling) — a harness limitation, not a
  // finding about the application code. That gap in this real-outage layer
  // is closed with a direct unit test instead — see the new
  // auth.controller.spec.ts, added specifically because this investigation
  // found no existing coverage of either email-failure policy at that
  // layer — rather than reported as a false, unverified production finding
  // or left silently uncovered.
});
