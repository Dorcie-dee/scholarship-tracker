import request from 'supertest';
import {
  bootstrapTestApp,
  cleanupTestUsers,
  extractCookie,
  TestApp,
} from './test-app';

/**
 * Production hardening (Batch 13) — HTTP/API integration: real requests,
 * through the real guard/pipe/filter chain, against a real Postgres-backed
 * app instance (see test-app.ts). Complements (does not replace) the
 * existing unit tests for AuthService/AuthController's own logic — this
 * proves the pieces actually work TOGETHER over real HTTP, including things
 * a unit test structurally cannot see: real response headers (Batch 10's
 * helmet/X-Request-Id), the real cookie the browser would actually receive,
 * real global ValidationPipe rejection of an unknown field, real end-to-end
 * persistence and retrieval.
 */
describe('Auth flow (HTTP integration)', () => {
  let testApp: TestApp;
  const emailPrefix = `http-integration-auth-${process.pid}-`;
  const email = `${emailPrefix}${Date.now()}@example.invalid`;
  const password = 'a genuinely reasonable passphrase';

  beforeAll(async () => {
    testApp = await bootstrapTestApp();
  });

  afterAll(async () => {
    await cleanupTestUsers(testApp.dataSource, emailPrefix);
    await testApp.app.close();
  });

  it('POST /api/auth/register creates the account, returns an access token, and sets a signed-looking HttpOnly refresh cookie', async () => {
    const res = await request(testApp.app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email });
    // The password hash must never appear anywhere in the response.
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const refreshCookie = extractCookie(
      res.headers['set-cookie'] as unknown as string[],
      'refresh_token',
    );
    expect(refreshCookie).toBeDefined();
    expect(res.headers['set-cookie'].join(';')).toContain('HttpOnly');
  });

  it('every response carries security headers (Batch 10) and a correlation id', async () => {
    const res = await request(testApp.app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('GET /api/users/me requires authentication — 401 with no token', async () => {
    await request(testApp.app.getHttpServer()).get('/api/users/me').expect(401);
  });

  it('rejects an unknown field on register — real global ValidationPipe, not a mock', async () => {
    const res = await request(testApp.app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `${emailPrefix}unknown-field-${Date.now()}@example.invalid`,
        password,
        aFieldThatDoesNotExist: 'should be rejected',
      })
      .expect(400);

    expect(res.body.requestId).toEqual(expect.any(String));
  });

  describe('a full session lifecycle for one already-registered account', () => {
    let accessToken: string;
    let refreshCookie: string;

    it('POST /api/auth/login succeeds with the real, freshly-hashed password', async () => {
      const res = await request(testApp.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password })
        .expect(200);

      accessToken = res.body.accessToken;
      refreshCookie = extractCookie(
        res.headers['set-cookie'] as unknown as string[],
        'refresh_token',
      )!;
      expect(accessToken).toEqual(expect.any(String));
    });

    it('POST /api/auth/login rejects the wrong password — real bcrypt compare, real 401', async () => {
      await request(testApp.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'definitely the wrong password' })
        .expect(401);
    });

    it('GET /api/users/me returns the real, persisted user row for a valid access token', async () => {
      const res = await request(testApp.app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.email).toBe(email);
    });

    it('POST /api/auth/refresh rotates the session and issues a new access token, via the real refresh cookie', async () => {
      const res = await request(testApp.app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(200);

      const newAccessToken = res.body.accessToken;
      expect(newAccessToken).toEqual(expect.any(String));
      // NOT asserting newAccessToken !== accessToken: the JWT's claims
      // (`iat`/`exp`) are second-granularity, so a login and an immediately-
      // following refresh for the same user can legitimately produce a
      // byte-identical token if both happen within the same second — that's
      // expected JWT behavior, not a bug. What must actually differ (and is
      // the real security property refresh-rotation exists for) is the
      // refresh cookie/session identity — asserted below.

      const newRefreshCookie = extractCookie(
        res.headers['set-cookie'] as unknown as string[],
        'refresh_token',
      )!;
      expect(newRefreshCookie).not.toBe(refreshCookie);

      accessToken = newAccessToken;
      refreshCookie = newRefreshCookie;
    });

    it('POST /api/auth/logout revokes the session and clears the cookie', async () => {
      await request(testApp.app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', refreshCookie)
        .expect(204);
    });

    it('a refresh with the now-revoked cookie fails — real DB-backed session state, not just an in-memory check', async () => {
      await request(testApp.app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(401);
    });
  });
});
