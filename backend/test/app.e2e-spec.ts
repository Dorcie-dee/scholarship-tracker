import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

// Skipped: these tests need a real `scholarship_os_test` database to connect
// to (see test/setup-env.ts), which doesn't exist yet on the Postgres server
// `.env` currently points at (Neon). Create that database, then remove
// `.skip` here to turn these back on.
describe.skip('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('/api/health (GET) is public and reports ok', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(expect.objectContaining({ status: 'ok' }));
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
