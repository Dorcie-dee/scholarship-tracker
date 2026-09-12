// Must be the very first import — sets process.env (hardcoded local
// Postgres, never Neon; see that file's doc comment) before AppModule
// (transitively required by test-app.ts below) is ever loaded.
import '../http-integration/setup-env';
import autocannon from 'autocannon';
import request from 'supertest';
import {
  bootstrapTestApp,
  cleanupTestUsers,
  TestApp,
} from '../http-integration/test-app';

/**
 * Production hardening (Batch 15) — load testing.
 *
 * Not a Jest spec (no pass/fail assertions) — this is a measurement tool,
 * run manually (`yarn ts-node -r tsconfig-paths/register test/load/run-
 * load-test.ts`, after `test/http-integration/setup-env.ts`'s env values
 * are set — see the shell wrapper this is invoked through) that boots the
 * REAL app against real local Postgres (`scholarship_os_test` — same
 * hardcoded-safe connection as every other new test layer this phase
 * added; never Neon) and drives real HTTP load against it with
 * `autocannon`, reporting real p50/p95/p99/throughput/error-rate numbers.
 *
 * **Honest scope of what this measures, stated up front**: this sandbox is
 * one machine running both the load generator and the app/DB, and all
 * requests arrive from a single source IP. This app's rate limiter (Batch
 * 3) is keyed by IP with a default 100-requests/60s budget for any route
 * without its own `@Throttle()` override — and this load test itself
 * corrected an assumption about that limit made while writing it: the
 * budget is tracked PER HANDLER (controller+route+IP), not pooled globally
 * across every unthrottled route — confirmed directly below, where
 * `/health` and `/health/ready` each ran their own full, independent
 * request batch with zero rejections, and `/universities` (a separate
 * handler) hit its OWN 100-request ceiling on its own 150-request batch,
 * unaffected by the ~80 prior requests already made to the other two
 * handlers. Genuine, real production behavior either way — this app
 * correctly rejecting a single client that exceeds ITS fair-use budget for
 * a given endpoint — is *unavoidably* part of what any single-IP load test
 * against this app will observe, and is reported as such below, not
 * filtered out. This does NOT measure
 * multi-instance horizontal scaling, real network latency, or genuinely
 * distributed client load (many real source IPs) — see docs/decisions.md,
 * "Batch 15" and the final report's Load-Test Results section for the
 * explicit limitations this implies.
 */
async function main() {
  const testApp: TestApp = await bootstrapTestApp();
  const emailPrefix = `load-test-${process.pid}-`;
  const email = `${emailPrefix}${Date.now()}@example.invalid`;
  const password = 'a genuinely reasonable passphrase';

  const registerRes = await request(testApp.app.getHttpServer())
    .post('/api/auth/register')
    .send({ email, password });
  const accessToken: string = registerRes.body.accessToken;

  await testApp.app.listen(0);
  const address = testApp.app.getHttpServer().address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  console.log(`\nLoad test target: ${baseUrl}\n`);

  const scenarios: {
    name: string;
    url: string;
    headers?: Record<string, string>;
    connections: number;
    amount: number;
  }[] = [
    {
      name: 'GET /health (no DB, no auth) — baseline app/framework overhead',
      url: `${baseUrl}/health`,
      connections: 10,
      amount: 50,
    },
    {
      name: 'GET /health/ready (real DB round trip: SELECT 1) — DB latency baseline',
      url: `${baseUrl}/health/ready`,
      connections: 5,
      amount: 30,
    },
    {
      name: 'GET /universities (authenticated, paginated DB query) — realistic endpoint, deliberately pushed past the shared 100-req/60s IP budget to observe graceful degradation',
      url: `${baseUrl}/universities?limit=10`,
      headers: { Authorization: `Bearer ${accessToken}` },
      connections: 20,
      amount: 150,
    },
  ];

  for (const scenario of scenarios) {
    console.log(`\n=== ${scenario.name} ===`);
    const result = await autocannon({
      url: scenario.url,
      connections: scenario.connections,
      amount: scenario.amount,
      headers: scenario.headers,
    });
    console.log(
      JSON.stringify(
        {
          requests: result.requests,
          latency_ms: result.latency,
          throughput_bytes_per_sec: result.throughput,
          duration_s: result.duration,
          errors: result.errors,
          timeouts: result.timeouts,
          non2xx: result.non2xx,
          '1xx': result['1xx'],
          '2xx': result['2xx'],
          '3xx': result['3xx'],
          '4xx': result['4xx'],
          '5xx': result['5xx'],
        },
        null,
        2,
      ),
    );
  }

  await cleanupTestUsers(testApp.dataSource, emailPrefix);
  await testApp.app.close();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
