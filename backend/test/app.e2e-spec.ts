import request from 'supertest';
import { bootstrapTestApp, TestApp } from './http-integration/test-app';

/**
 * Final verification pass — un-skipped. Previously blocked on
 * `scholarship_os_test` not existing on whatever server `.env` pointed at
 * (Neon); `test/setup-env.ts` now hardcodes local Postgres (see its own doc
 * comment), so this runs safely regardless of `.env`'s content. Reuses
 * `bootstrapTestApp()` (the same, already-audited real-app bootstrap the
 * newer `test/http-integration/*.http-integration-spec.ts` layer uses)
 * rather than re-implementing app construction here — one safe bootstrap
 * path, not two.
 */
describe('AppController (e2e)', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await bootstrapTestApp();
  });

  afterEach(async () => {
    await testApp.app.close();
  });

  it('/api/health (GET) is public and reports ok', () => {
    return request(testApp.app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(expect.objectContaining({ status: 'ok' }));
      });
  });
});
