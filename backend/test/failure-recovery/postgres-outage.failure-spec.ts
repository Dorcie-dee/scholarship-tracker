import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';

/**
 * Production hardening (Batch 16) — failure/recovery testing: PostgreSQL
 * unavailability, real (not mocked).
 *
 * **Scope, stated honestly**: both scenarios below simulate the database
 * being unreachable AT STARTUP (an unreachable port; a non-routable
 * address), not a genuine mid-flight outage of an already-running app's
 * established connections. TypeORM's `DataSource.initialize()` runs eagerly
 * during Nest's own bootstrap (`TypeOrmModule.forRootAsync`), so an
 * already-booted app in this test process cannot be made to lose DB
 * connectivity without either stopping the actual shared local Postgres
 * server this sandbox's other test layers also depend on, or revoking/
 * restoring real database privileges mid-run — both considered and
 * rejected as too invasive/risky for what this checkpoint needs to prove.
 * What genuinely matters for a mid-flight outage IS exercised elsewhere,
 * just not by literally cutting a live connection: `GET /health/ready`
 * (Batch 1) already catches a real DB failure and reports 503 without
 * leaking driver detail (see app.service.spec.ts), and the connection
 * pool's `connectionTimeoutMillis` (Batch 1) — verified for real below —
 * is exactly the mechanism that stops an in-flight request from hanging
 * indefinitely if connectivity degrades while the app is already running.
 *
 * **A real finding this test run itself surfaced**: `TypeOrmModule` has its
 * own built-in retry loop around `DataSource.initialize()` — unmodified
 * here (`typeorm.config.ts` sets neither `retryAttempts` nor
 * `retryDelay`), so it uses Nest's own default (10 attempts, ~3s apart).
 * That means a genuinely bad DB connection takes roughly 30 seconds to
 * surface as a startup failure, not instantly — generous test timeouts
 * below reflect that real, measured duration rather than assuming a fast
 * fail. Arguably the right default for production (tolerating a DB
 * container/orchestrator race at deploy time), not a bug — see
 * docs/decisions.md, "Batch 16" for the explicit decision to leave it as
 * Nest's default rather than override it without a concrete reason to.
 */
describe('PostgreSQL outage (real, at startup)', () => {
  const originalHost = process.env.POSTGRES_HOST;
  const originalPort = process.env.POSTGRES_PORT;

  afterEach(() => {
    process.env.POSTGRES_HOST = originalHost;
    process.env.POSTGRES_PORT = originalPort;
  });

  it('fails to start cleanly (not hang, not a silent broken app) when the configured port refuses connections', async () => {
    process.env.POSTGRES_PORT = '5499'; // nothing listens here in this sandbox

    await expect(
      (async () => {
        const moduleFixture = await Test.createTestingModule({
          imports: [AppModule],
        }).compile();
        const app =
          moduleFixture.createNestApplication<NestExpressApplication>();
        configureApp(app);
        await app.init();
        await app.close();
      })(),
    ).rejects.toThrow();
  }, 60000);

  it("honors the connection pool's connectionTimeoutMillis bound — fails within a bounded time, doesn't hang indefinitely, against a non-routable address", async () => {
    // A reserved, non-routable TEST-NET address (RFC 5737) — connection
    // attempts to it neither succeed nor immediately refuse; the OS-level
    // TCP handshake just never completes, which is exactly the failure
    // shape `connectionTimeoutMillis` exists to bound (an ECONNREFUSED
    // fails near-instantly on its own and wouldn't prove this config does
    // anything).
    process.env.POSTGRES_HOST = '192.0.2.1';

    const start = Date.now();
    await expect(
      (async () => {
        const moduleFixture = await Test.createTestingModule({
          imports: [AppModule],
        }).compile();
        const app =
          moduleFixture.createNestApplication<NestExpressApplication>();
        configureApp(app);
        await app.init();
        await app.close();
      })(),
    ).rejects.toThrow();
    const elapsedMs = Date.now() - start;

    // Nest's own default retry loop (10 attempts) multiplies this out — see
    // this file's doc comment — so the bound here is "definitely not the
    // OS's much longer black-hole TCP timeout (often 60-130+ seconds PER
    // ATTEMPT, which un-bounded would make 10 retries take 10-20+ minutes)",
    // not "instant". `connectionTimeoutMillis` (5s default) is genuinely
    // being honored per-attempt if the whole sequence finishes in well under
    // a minute rather than hanging far longer.
    expect(elapsedMs).toBeLessThan(85000);
  }, 90000);
});
