import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

/** Pulls just `name=value` out of a `Set-Cookie` header, dropping attributes (Path, HttpOnly, ...). */
function extractCookie(
  setCookieHeader: string[] | undefined,
  name: string,
): string | undefined {
  const raw = setCookieHeader?.find((c) => c.startsWith(`${name}=`));
  return raw?.split(';')[0];
}

// Skipped: these tests need a real `scholarship_os_test` database to connect
// to (see test/setup-env.ts), which doesn't exist yet on the Postgres server
// `.env` currently points at (Neon). Create that database, then remove
// `.skip` here to turn these back on.
describe.skip('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const email = `e2e-auth-${process.pid}@example.invalid`;
  const password = 'correct horse battery staple';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get<DataSource>(getDataSourceToken());
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM users WHERE email = $1', [email]);
    await app.close();
  });

  it('rejects a protected route with no access token', () => {
    return request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('rejects login for an account that does not exist', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(401);
  });

  let refreshCookie: string;
  let accessToken: string;

  it('registers a new user, returning an access token and setting a refresh cookie', async () => {
    const res = await request(app.getHttpServer())
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
    return request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, name: 'Duplicate' })
      .expect(409);
  });

  it('accesses a protected route using the access token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body).toEqual(expect.objectContaining({ email }));
  });

  it('rejects login with the wrong password', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'wrong password entirely' })
      .expect(401);
  });

  let rotatedCookie: string;

  it('rotates the refresh token on refresh, invalidating the old one', async () => {
    const res = await request(app.getHttpServer())
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
    const replay = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(401);
    expect(replay.body.message).toMatch(/reuse detected/i);

    // Reuse detection must have revoked the *rotated* session too, not just the replayed one.
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', rotatedCookie)
      .expect(401);
  });

  it('logs in again to get a fresh session, then logs out and can no longer refresh', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const cookie = extractCookie(
      loginRes.headers['set-cookie'],
      'refresh_token',
    )!;

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
  });
});
