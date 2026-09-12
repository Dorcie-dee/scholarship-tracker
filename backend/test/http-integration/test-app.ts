import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';

/**
 * Production hardening (Batch 13) — boots the REAL `AppModule` through the
 * REAL `configureApp()` (the same function `main.ts` calls) rather than a
 * hand-assembled subset — deliberately a departure from this codebase's
 * usual "never `Test.createTestingModule()`, always direct construction"
 * unit-test convention (see decisions.md/CLAUDE.md-equivalent project
 * conventions): HTTP integration testing's entire point is exercising the
 * full, real DI graph, guard chain (JwtAuthGuard → RolesGuard →
 * ProductionThrottlerGuard), global pipes/interceptors/filters, and actual
 * Postgres persistence together, the way a real request does — a
 * hand-built subset would just be testing a second, different pipeline
 * from production's.
 *
 * Connects to real local Postgres (`scholarship_os_test` — see
 * setup-env.ts, loaded before this file, before `AppModule` is even
 * imported) — never Neon, never the developer's own `scholarship_os_dev`.
 */
export interface TestApp {
  app: NestExpressApplication;
  dataSource: DataSource;
}

export async function bootstrapTestApp(): Promise<TestApp> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();

  const dataSource = app.get<DataSource>(getDataSourceToken());

  return { app, dataSource };
}

/** Pulls just `name=value` out of a `Set-Cookie` header, dropping attributes (Path, HttpOnly, ...). */
export function extractCookie(
  setCookieHeader: string[] | undefined,
  name: string,
): string | undefined {
  const raw = setCookieHeader?.find((c) => c.startsWith(`${name}=`));
  return raw?.split(';')[0];
}

/**
 * Deletes exactly the rows this test run created, by email prefix — never a
 * blanket TRUNCATE (this database is shared across a whole spec file's
 * tests, potentially run alongside `test:db-integration`, and a future
 * developer's own manual poking at `scholarship_os_test`). Cascades handle
 * everything owned by the deleted users (journeys, applications, documents,
 * refresh sessions, ...) — see decisions.md's cascade-graph documentation.
 */
export async function cleanupTestUsers(
  dataSource: DataSource,
  emailPrefix: string,
): Promise<void> {
  await dataSource.query('DELETE FROM users WHERE email LIKE $1', [
    `${emailPrefix}%`,
  ]);
}
