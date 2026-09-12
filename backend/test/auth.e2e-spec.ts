import request from 'supertest';
import {
  bootstrapTestApp,
  cleanupTestUsers,
  extractCookie,
  TestApp,
} from './http-integration/test-app';

/**
 * Final verification pass — un-skipped, same reasoning as
 * `app.e2e-spec.ts`. This suite is intentionally kept as a separate,
 * optional layer alongside `test/http-integration/auth-flow.http-
 * integration-spec.ts` (Batch 13) rather than deleted, even though the two
 * overlap substantially — both are real value: this one is the original,
 * more granular session-lifecycle suite (reuse/replay detection asserted
 * message-content, not just status code; a fresh-login-then-logout cycle
 * after reuse-revocation) and exercising it costs nothing once its
 * connection target is safe.
 */
describe('Auth (e2e)', () => {
  let testApp: TestApp;
  const emailPrefix = `e2e-auth-${process.pid}-`;
  const email = `${emailPrefix}${Date.now()}@example.invalid`;
  const password = 'correct horse battery staple';

  beforeAll(async () => {
    testApp = await bootstrapTestApp();
  });

  afterAll(async () => {
    await cleanupTestUsers(testApp.dataSource, emailPrefix);
    await testApp.app.close();
  });

  it('rejects a protected route with no access token', () => {
    return request(testApp.app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('rejects login for an account that does not exist', () => {
    return request(testApp.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(401);
  });

  let refreshCookie: string;
  let accessToken: string;

  it('registers a new user, returning an access token and setting a refresh cookie', async () => {
    const res = await request(testApp.app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, name: 'E2E Test' })
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toEqual(
      expect.objectContaining({ email, name: 'E2E Test' }),
    );
    expect(res.body.user.passwordHash).toBeUndefined();

    const cookie = extractCookie(res.headers['set-cookie'], 'refresh_token');
    expect(cookie).toBeDefined();
    refreshCookie = cookie!;
    accessToken = res.body.accessToken;
  });

  it('rejects registering the same email twice', () => {
    return request(testApp.app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, name: 'Duplicate' })
      .expect(409);
  });

  it('accesses a protected route using the access token', async () => {
    const res = await request(testApp.app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body).toEqual(expect.objectContaining({ email }));
  });

  it('rejects login with the wrong password', () => {
    return request(testApp.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'wrong password entirely' })
      .expect(401);
  });

  let rotatedCookie: string;

  it('rotates the refresh token on refresh, invalidating the old one', async () => {
    const res = await request(testApp.app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(200);

    const cookie = extractCookie(res.headers['set-cookie'], 'refresh_token');
    expect(cookie).toBeDefined();
    expect(cookie).not.toEqual(refreshCookie);
    rotatedCookie = cookie!;
  });

  it('detects reuse of a rotated-out refresh token and revokes every session for that user', async () => {
    // The pre-rotation cookie was already consumed by the previous test.
    const replay = await request(testApp.app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(401);
    expect(replay.body.message).toMatch(/reuse detected/i);

    // Reuse detection must have revoked the *rotated* session too, not just the replayed one.
    await request(testApp.app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', rotatedCookie)
      .expect(401);
  });

  it('logs in again to get a fresh session, then logs out and can no longer refresh', async () => {
    const loginRes = await request(testApp.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const cookie = extractCookie(
      loginRes.headers['set-cookie'],
      'refresh_token',
    )!;

    await request(testApp.app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .expect(204);

    await request(testApp.app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
  });
});
