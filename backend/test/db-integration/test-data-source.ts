import { DataSource } from 'typeorm';

/**
 * Production hardening (Batch 12) — DB integration test infrastructure.
 *
 * **Deliberately hardcoded to local Postgres, never derived from `.env` or
 * `process.env.POSTGRES_*`.** This is the one concrete safety property this
 * whole test layer depends on: `.env` in this repo currently points at
 * Neon (`POSTGRES_HOST=ep-...-pooler.c-10.us-east-1.aws.neon.tech`), and
 * this codebase's own standing rule is that Neon is touched only for
 * migrations against DEVELOP, never for test data. The pre-existing
 * `test/jest-e2e.json` setup (`test/setup-env.ts`) does NOT have this
 * property — it only overrides `POSTGRES_DB` and inherits host/user/
 * password/ssl from `.env`, so on a machine where `.env` points at Neon,
 * `yarn test:e2e` would try to run destructive integration tests against a
 * database on the Neon project itself (`scholarship_os_test`, which
 * doesn't even exist there) rather than local Postgres. That's a real,
 * confirmed gap in the existing e2e harness — documented in
 * docs/decisions.md, "Batch 12" — left as-is (not modified, not invoked)
 * per this project's standing instruction never to run `yarn test:e2e`
 * this session; this new, separate test layer exists specifically so DB
 * integration testing can happen safely without going anywhere near that
 * gap.
 *
 * Points at `scholarship_os_test`, a real local Postgres 16 database
 * (confirmed present via `psql -l`), migrated to the current schema before
 * this file is first used (see `runMigrations()` below — idempotent, safe
 * to call every run).
 */
export function createTestDataSource(): DataSource {
  return new DataSource({
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'scholarship_os',
    password: 'scholarship_os_dev_password',
    database: 'scholarship_os_test',
    ssl: false,
    entities: [__dirname + '/../../src/**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../../src/database/migrations/*{.ts,.js}'],
    synchronize: false,
  });
}

/**
 * Runs any pending migrations against the test database — idempotent
 * (TypeORM tracks applied migrations in its own `migrations` table and
 * skips ones already run), so this is safe to call at the start of every
 * suite run without risking a double-apply. Ensures a fresh checkout (or a
 * CI runner with an empty test database) works without a manual setup step.
 */
export async function ensureTestSchemaUpToDate(
  dataSource: DataSource,
): Promise<void> {
  await dataSource.runMigrations();
}
