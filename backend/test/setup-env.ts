/**
 * Final verification pass — fixed a real safety gap: this file previously
 * overrode only `POSTGRES_DB`, inheriting host/user/password/ssl from
 * `.env` — and `.env` in this repo points at Neon. On a machine in that
 * state, `yarn test:e2e` would have attempted to connect to a database
 * named `scholarship_os_test` on the Neon project itself, not local
 * Postgres (it happened to fail harmlessly only because that database
 * doesn't exist there — a fragile accident of the current `.env`'s
 * content, not a real safety guarantee; a differently-configured `.env`
 * could have made this genuinely destructive against a shared database).
 *
 * Every value below is now hardcoded, exactly like the four newer test
 * layers this hardening phase built (`test/db-integration/
 * test-data-source.ts`, `test/http-integration/setup-env.ts`,
 * `test/failure-recovery/`'s shared setup) — **never derived from `.env`
 * in any way**, so `yarn test:e2e` cannot target Neon (or any other
 * developer-configured database) regardless of what `.env` contains.
 * Loaded via `jest-e2e.json`'s `setupFiles`, before `AppModule` (and the
 * `ConfigModule` that loads `.env`) is ever imported — dotenv never
 * overwrites an already-set environment variable, so by the time `.env`
 * loads, every value set here wins.
 *
 * Points at `scholarship_os_test`, the same real local Postgres 16
 * database the other four test layers use — create/migrate it once (see
 * `docs/development.md`'s Testing section) and every test layer, including
 * this one, works with no further setup.
 */
process.env.NODE_ENV = 'test';
process.env.POSTGRES_HOST = 'localhost';
process.env.POSTGRES_PORT = '5432';
process.env.POSTGRES_USER = 'scholarship_os';
process.env.POSTGRES_PASSWORD = 'scholarship_os_dev_password';
process.env.POSTGRES_DB = 'scholarship_os_test';
process.env.POSTGRES_SSL = 'false';
process.env.JWT_ACCESS_SECRET = 'test_only_access_secret_do_not_use_elsewhere';
process.env.BCRYPT_SALT_ROUNDS = '4'; // fast hashing — these tests don't need real security
// Explicitly unset, same reasoning as the other newer test layers — Redis/
// Cloudinary/SMTP absence is a real, already-tested, graceful-degradation
// path, not a missing-setup error.
delete process.env.REDIS_URL;
delete process.env.CLOUDINARY_CLOUD_NAME;
delete process.env.CLOUDINARY_API_KEY;
delete process.env.CLOUDINARY_API_SECRET;
delete process.env.EMAIL_SMTP_HOST;
