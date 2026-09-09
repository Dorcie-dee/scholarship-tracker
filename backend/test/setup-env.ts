/**
 * Loaded via jest-e2e.json's `setupFiles` — runs before any test file, before
 * the app (and its ConfigModule, which loads `.env`) boots.
 *
 * Sets test-only overrides directly on process.env rather than via a separate
 * `.env.test` file — there are deliberately only two env files in this app
 * (`.env`, `sample.env`; see docs/decisions.md). dotenv never overwrites an
 * already-set environment variable, so by the time ConfigModule loads `.env`,
 * these values win and everything else (DB host/port/user/password/ssl, JWT
 * expiry, etc.) falls through to `.env` unchanged — the e2e suite runs against
 * whatever Postgres server `.env` points at, just a different database name.
 * That database (`scholarship_os_test`) must actually exist there — if `.env`
 * points at a managed provider instead of local Postgres, create it there too.
 */
process.env.NODE_ENV = 'test';
process.env.POSTGRES_DB = 'scholarship_os_test';
process.env.JWT_ACCESS_SECRET = 'test_only_access_secret_do_not_use_elsewhere';
process.env.BCRYPT_SALT_ROUNDS = '4'; // fast hashing — these tests don't need real security
