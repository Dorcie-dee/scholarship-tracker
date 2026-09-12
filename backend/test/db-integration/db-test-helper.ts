import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import {
  createTestDataSource,
  ensureTestSchemaUpToDate,
} from './test-data-source';

/**
 * Production hardening (Batch 12) — one shared DataSource per test FILE
 * (not per test — opening/closing a real Postgres connection per test would
 * be needlessly slow), with each individual test running inside its own
 * transaction that is always rolled back afterward, win or lose. This is
 * the standard, fast, reliable DB-integration-test isolation pattern: every
 * test starts from the exact same baseline (an empty, freshly-migrated
 * schema — no seeded fixtures baked into the harness itself, each test
 * creates exactly the rows it needs) and never leaves any residue for the
 * next test, regardless of run order or a mid-test failure — `afterEach`
 * always rolls back, even if the test body threw.
 *
 * Call `setupDbIntegrationTest()` once per spec file's top-level
 * `beforeAll`/`afterAll`, and use the `manager` it hands to `beforeEach`
 * for every repository access in that test — never the DataSource's own
 * top-level `.manager` (that would run outside the per-test transaction and
 * actually commit).
 */
export interface DbIntegrationTestContext {
  dataSource: DataSource;
  queryRunner: QueryRunner;
  manager: EntityManager;
}

export function setupDbIntegrationTest(): {
  beforeAll: () => Promise<void>;
  afterAll: () => Promise<void>;
  beforeEach: () => Promise<DbIntegrationTestContext>;
  afterEach: () => Promise<void>;
  getContext: () => DbIntegrationTestContext;
} {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let ctx: DbIntegrationTestContext;

  return {
    beforeAll: async () => {
      dataSource = createTestDataSource();
      await dataSource.initialize();
      await ensureTestSchemaUpToDate(dataSource);
    },
    afterAll: async () => {
      await dataSource.destroy();
    },
    beforeEach: async () => {
      queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      ctx = { dataSource, queryRunner, manager: queryRunner.manager };
      return ctx;
    },
    afterEach: async () => {
      // Always rolls back — a test never commits real data, whether it
      // passed, failed, or threw partway through.
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
    },
    getContext: () => ctx,
  };
}
