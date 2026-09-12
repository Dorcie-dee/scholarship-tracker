/**
 * Production hardening (Batch 13) — loaded via jest-http-integration.json's
 * `setupFiles`, before `AppModule` (and the `ConfigModule` that loads
 * `.env`) is ever imported.
 *
 * **Every relevant POSTGRES_* variable is set here explicitly — not just
 * `POSTGRES_DB` — deliberately unlike the older `test/setup-env.ts` (used
 * by the still-skipped `test/*.e2e-spec.ts`).** That harness only
 * overrides the database name and inherits host/user/password/ssl from
 * `.env`; since `.env` in this repo currently points at Neon, an HTTP
 * integration layer built the same way would try to run real HTTP
 * requests — registrations, logins, mutations — against a database on the
 * Neon project itself. See docs/decisions.md, "Batch 12"/"Batch 13" for the
 * full reasoning; `test/db-integration/test-data-source.ts` established
 * the same hardcoded-local-Postgres property for the DB integration layer,
 * this file gives the HTTP integration layer the identical guarantee.
 *
 * dotenv (invoked inside `ConfigModule.forRoot()`) never overwrites an
 * already-set environment variable, so by the time `.env` loads, every
 * value set here wins.
 */
process.env.NODE_ENV = 'test';
process.env.POSTGRES_HOST = 'localhost';
process.env.POSTGRES_PORT = '5432';
process.env.POSTGRES_USER = 'scholarship_os';
process.env.POSTGRES_PASSWORD = 'scholarship_os_dev_password';
process.env.POSTGRES_DB = 'scholarship_os_test';
process.env.POSTGRES_SSL = 'false';
process.env.JWT_ACCESS_SECRET =
  'test_only_http_integration_access_secret_do_not_use_elsewhere';
process.env.BCRYPT_SALT_ROUNDS = '4'; // fast hashing — these tests don't need real security
// Explicitly unset — REDIS_URL/CLOUDINARY_*/EMAIL_SMTP_HOST intentionally
// stay unconfigured for this layer (Redis absent → in-memory rate-limit
// fallback; Cloudinary absent → document upload flows are out of scope for
// this layer, covered instead by unit + DB integration tests; SMTP absent,
// non-production → the dev log transport, no real email sent).
delete process.env.REDIS_URL;
delete process.env.CLOUDINARY_CLOUD_NAME;
delete process.env.CLOUDINARY_API_KEY;
delete process.env.CLOUDINARY_API_SECRET;
delete process.env.EMAIL_SMTP_HOST;
