import request from 'supertest';
import { bootstrapTestApp, cleanupTestUsers, TestApp } from './test-app';
import { UserRole } from '../../src/types';

/**
 * ADMIN user directory + live-role RolesGuard hardening.
 */
describe('Admin user directory (HTTP integration)', () => {
  let testApp: TestApp;
  const emailPrefix = `admin-dir-${process.pid}-`;
  const password = 'a genuinely reasonable passphrase';
  let adminToken: string;
  let demotedToken: string;
  let demotedUserId: string;
  let userToken: string;
  let survivingAdminId: string;

  beforeAll(async () => {
    testApp = await bootstrapTestApp();

    const adminEmail = `${emailPrefix}admin-${Date.now()}@example.invalid`;
    const demotedEmail = `${emailPrefix}demoted-${Date.now()}@example.invalid`;
    const userEmail = `${emailPrefix}user-${Date.now()}@example.invalid`;

    const adminRes = await request(testApp.app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: adminEmail, password, name: 'Directory Admin' });
    survivingAdminId = adminRes.body.user.id;
    await testApp.dataSource.query(
      `UPDATE users SET role = 'admin' WHERE email = $1`,
      [adminEmail],
    );
    const adminLogin = await request(testApp.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password });
    adminToken = adminLogin.body.accessToken;

    const demotedRes = await request(testApp.app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: demotedEmail, password, name: 'Soon Demoted' });
    demotedUserId = demotedRes.body.user.id;
    await testApp.dataSource.query(
      `UPDATE users SET role = 'admin' WHERE email = $1`,
      [demotedEmail],
    );
    const demotedLogin = await request(testApp.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: demotedEmail, password });
    demotedToken = demotedLogin.body.accessToken;

    const userRes = await request(testApp.app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: userEmail, password, name: 'Ordinary User' });
    userToken = userRes.body.accessToken;

    // Seed extra searchable users for pagination/search.
    for (let i = 0; i < 5; i += 1) {
      await request(testApp.app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `${emailPrefix}seed-${i}-${Date.now()}@example.invalid`,
          password,
          name: i === 0 ? 'UniqueSearchNameZed' : `Seed ${i}`,
        });
    }
  });

  afterAll(async () => {
    await cleanupTestUsers(testApp.dataSource, emailPrefix);
    await testApp.app.close();
  });

  it('rejects unauthenticated callers with 401', async () => {
    await request(testApp.app.getHttpServer()).get('/api/users').expect(401);
  });

  it('rejects ordinary USER with 403', async () => {
    await request(testApp.app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('returns a safe paginated directory for ADMIN', async () => {
    const res = await request(testApp.app.getHttpServer())
      .get('/api/users')
      .query({ limit: 3 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({
        items: expect.any(Array),
        nextCursor: expect.any(String),
        hasNextPage: true,
      }),
    );
    expect(res.body.items.length).toBe(3);
    for (const item of res.body.items) {
      expect(item).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          email: expect.any(String),
          role: expect.stringMatching(/^(user|admin)$/),
          isVerified: expect.any(Boolean),
          createdAt: expect.any(String),
        }),
      );
      expect(item.passwordHash).toBeUndefined();
      expect(item.refreshSessions).toBeUndefined();
    }
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const page2 = await request(testApp.app.getHttpServer())
      .get('/api/users')
      .query({ limit: 3, cursor: res.body.nextCursor })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const ids1 = res.body.items.map((u: { id: string }) => u.id);
    const ids2 = page2.body.items.map((u: { id: string }) => u.id);
    expect(ids1.some((id: string) => ids2.includes(id))).toBe(false);
  });

  it('supports name/email search and role filter', async () => {
    const byName = await request(testApp.app.getHttpServer())
      .get('/api/users')
      .query({ search: 'UniqueSearchNameZed' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(byName.body.items.length).toBeGreaterThanOrEqual(1);
    expect(byName.body.items[0].name).toContain('UniqueSearchNameZed');

    const byRole = await request(testApp.app.getHttpServer())
      .get('/api/users')
      .query({ role: UserRole.ADMIN })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      byRole.body.items.every((u: { role: string }) => u.role === 'admin'),
    ).toBe(true);
  });

  it('rejects invalid role filter', async () => {
    await request(testApp.app.getHttpServer())
      .get('/api/users')
      .query({ role: 'superadmin' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('treats LIKE metacharacters as literals (not match-all)', async () => {
    const all = await request(testApp.app.getHttpServer())
      .get('/api/users')
      .query({ limit: 100 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const escaped = await request(testApp.app.getHttpServer())
      .get('/api/users')
      .query({ search: '%' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(escaped.body.items.length).toBeLessThan(all.body.items.length);
  });

  it('blocks a demoted admin from GET /users even with a stale ADMIN JWT', async () => {
    // Demote while demotedToken still carries role=admin.
    await request(testApp.app.getHttpServer())
      .patch(`/api/users/${demotedUserId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: UserRole.USER })
      .expect(200);

    await request(testApp.app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${demotedToken}`)
      .expect(403);

    // Surviving admin still works.
    await request(testApp.app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(survivingAdminId).toBeTruthy();
  });
});
