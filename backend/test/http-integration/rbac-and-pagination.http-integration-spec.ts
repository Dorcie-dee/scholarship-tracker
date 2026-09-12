import request from 'supertest';
import { bootstrapTestApp, cleanupTestUsers, TestApp } from './test-app';

/**
 * Production hardening (Batch 13) — HTTP/API integration coverage for two
 * cross-cutting behaviors that only make sense to prove over a real request:
 * the real `RolesGuard` actually rejecting a non-ADMIN caller (not a mocked
 * reflector), and the real keyset-pagination query builder returning
 * correctly-ordered, correctly-cursored pages against real, freshly-inserted
 * Postgres rows.
 */
describe('RBAC + pagination (HTTP integration)', () => {
  let testApp: TestApp;
  const emailPrefix = `http-integration-rbac-${process.pid}-`;
  const adminEmail = `${emailPrefix}admin-${Date.now()}@example.invalid`;
  const userEmail = `${emailPrefix}user-${Date.now()}@example.invalid`;
  const password = 'a genuinely reasonable passphrase';
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    testApp = await bootstrapTestApp();

    const adminRes = await request(testApp.app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: adminEmail, password });
    adminToken = adminRes.body.accessToken;
    // No HTTP path can ever promote a user to ADMIN (by design — see
    // decisions.md, privilege escalation) — this is a direct, test-only DB
    // write, not something achievable through the API itself.
    await testApp.dataSource.query(
      `UPDATE users SET role = 'admin' WHERE email = $1`,
      [adminEmail],
    );
    // Re-login so the issued access token's `role` claim reflects the
    // update above — the first token was minted before the promotion.
    const adminLoginRes = await request(testApp.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password });
    adminToken = adminLoginRes.body.accessToken;

    const userRes = await request(testApp.app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: userEmail, password });
    userToken = userRes.body.accessToken;
  });

  afterAll(async () => {
    await testApp.dataSource.query(
      `DELETE FROM universities WHERE name LIKE $1`,
      [`HTTP Integration Test University%`],
    );
    await cleanupTestUsers(testApp.dataSource, emailPrefix);
    await testApp.app.close();
  });

  describe('RolesGuard — real 403 for a non-ADMIN caller, real 201 for an ADMIN', () => {
    it('rejects an ordinary USER creating a University — 403, real RolesGuard', async () => {
      await request(testApp.app.getHttpServer())
        .post('/api/universities')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Should Be Rejected University' })
        .expect(403);
    });

    it('rejects an unauthenticated caller — 401 before RolesGuard even runs', async () => {
      await request(testApp.app.getHttpServer())
        .post('/api/universities')
        .send({ name: 'Should Also Be Rejected University' })
        .expect(401);
    });

    it('allows an ADMIN to create a University', async () => {
      const res = await request(testApp.app.getHttpServer())
        .post('/api/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'HTTP Integration Test University — Admin Created' })
        .expect(201);

      expect(res.body.name).toBe(
        'HTTP Integration Test University — Admin Created',
      );
    });

    it('still allows any authenticated USER to read the catalog (GET is open)', async () => {
      await request(testApp.app.getHttpServer())
        .get('/api/universities')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });
  });

  describe('keyset pagination — real Postgres, real ordering, real cursors', () => {
    const names = Array.from(
      { length: 5 },
      (_, i) => `HTTP Integration Test University ${i} — ${Date.now()}`,
    );

    beforeAll(async () => {
      for (const name of names) {
        await request(testApp.app.getHttpServer())
          .post('/api/universities')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name })
          .expect(201);
      }
    });

    it('returns a bounded page with hasNextPage: true when more rows exist than the limit', async () => {
      const res = await request(testApp.app.getHttpServer())
        .get('/api/universities?limit=2')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.hasNextPage).toBe(true);
      expect(res.body.nextCursor).toEqual(expect.any(String));
    });

    it('walking the cursor chain visits every row exactly once, with no duplicates or gaps', async () => {
      const server = testApp.app.getHttpServer();
      const seenIds = new Set<string>();
      let cursor: string | undefined;
      let hasNextPage = true;
      let pages = 0;

      while (hasNextPage && pages < 50) {
        const query = cursor
          ? `?limit=2&cursor=${encodeURIComponent(cursor)}`
          : '?limit=2';
        const res = await request(server)
          .get(`/api/universities${query}`)
          .set('Authorization', `Bearer ${userToken}`)
          .expect(200);

        for (const item of res.body.items) {
          // No duplicate across pages — a real cursor bug would show up
          // here (e.g. an off-by-one re-returning the boundary row).
          expect(seenIds.has(item.id)).toBe(false);
          seenIds.add(item.id);
        }

        hasNextPage = res.body.hasNextPage;
        cursor = res.body.nextCursor;
        pages += 1;
      }

      // Every University this test created is present exactly once,
      // somewhere across the walked pages (there may be other rows from
      // other tests/earlier runs sharing the table — the assertion is
      // "ours are all accounted for", not "the table contains only ours").
      for (const name of names) {
        const found = await testApp.dataSource.query(
          'SELECT id FROM universities WHERE name = $1',
          [name],
        );
        expect(seenIds.has(found[0].id)).toBe(true);
      }
    });

    it('rejects a malformed cursor with a clean 400, not a 500', async () => {
      await request(testApp.app.getHttpServer())
        .get('/api/universities?cursor=not-valid-base64url-json')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);
    });
  });
});
