import request from 'supertest';
import { bootstrapTestApp, cleanupTestUsers, TestApp } from './test-app';
import { RequirementType, UserRole } from '../../src/types';

/**
 * Phase 2 HTTP integration — restore, snapshot revision/delete, AI
 * suggestion confirm/reject, and ADMIN role promotion.
 */
describe('Phase 2 capabilities (HTTP integration)', () => {
  let testApp: TestApp;
  const emailPrefix = `phase2-http-${process.pid}-`;
  const password = 'a genuinely reasonable passphrase';
  let ownerToken: string;
  let otherToken: string;
  let adminToken: string;
  let adminUserId: string;
  let otherUserId: string;
  let journeyId: string;
  let applicationId: string;

  const authed = (token: string) => ({
    get: (path: string) =>
      request(testApp.app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${token}`),
    post: (path: string) =>
      request(testApp.app.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${token}`),
    patch: (path: string) =>
      request(testApp.app.getHttpServer())
        .patch(path)
        .set('Authorization', `Bearer ${token}`),
    delete: (path: string) =>
      request(testApp.app.getHttpServer())
        .delete(path)
        .set('Authorization', `Bearer ${token}`),
  });

  beforeAll(async () => {
    testApp = await bootstrapTestApp();

    const ownerEmail = `${emailPrefix}owner-${Date.now()}@example.invalid`;
    const otherEmail = `${emailPrefix}other-${Date.now()}@example.invalid`;
    const adminEmail = `${emailPrefix}admin-${Date.now()}@example.invalid`;

    const ownerRes = await request(testApp.app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: ownerEmail, password });
    ownerToken = ownerRes.body.accessToken;

    const otherRes = await request(testApp.app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: otherEmail, password });
    otherToken = otherRes.body.accessToken;
    otherUserId = otherRes.body.user.id;

    const adminRes = await request(testApp.app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: adminEmail, password });
    adminUserId = adminRes.body.user.id;
    await testApp.dataSource.query(
      `UPDATE users SET role = 'admin' WHERE email = $1`,
      [adminEmail],
    );
    const adminLogin = await request(testApp.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password });
    adminToken = adminLogin.body.accessToken;

    const journeyRes = await authed(ownerToken)
      .post('/api/journeys')
      .send({ title: 'Phase 2 Journey' });
    journeyId = journeyRes.body.id;

    const appRes = await authed(ownerToken)
      .post('/api/applications')
      .send({ journeyId, title: 'Phase 2 Application' });
    applicationId = appRes.body.id;
  });

  afterAll(async () => {
    await cleanupTestUsers(testApp.dataSource, emailPrefix);
    await testApp.app.close();
  });

  describe('application restore', () => {
    it('hides then restores an owned soft-deleted application and its requirement', async () => {
      const appRes = await authed(ownerToken)
        .post('/api/applications')
        .send({ journeyId, title: 'Restore me' });
      const appId = appRes.body.id;

      const reqRes = await authed(ownerToken).post('/api/requirements').send({
        applicationId: appId,
        requirementType: RequirementType.LANGUAGE,
        description: 'IELTS',
      });
      const reqId = reqRes.body.id;

      await authed(ownerToken).delete(`/api/applications/${appId}`).expect(204);
      await authed(ownerToken).get(`/api/applications/${appId}`).expect(404);
      await authed(ownerToken).get(`/api/requirements/${reqId}`).expect(404);

      const restored = await authed(ownerToken)
        .post(`/api/applications/${appId}/restore`)
        .expect(201);
      expect(restored.body.id).toBe(appId);

      await authed(ownerToken).get(`/api/applications/${appId}`).expect(200);
      await authed(ownerToken).get(`/api/requirements/${reqId}`).expect(200);
    });

    it('returns 404 for another user restore attempt', async () => {
      await authed(otherToken)
        .post(`/api/applications/${applicationId}/restore`)
        .expect(404);
    });

    it('returns 409 when restoring an active application', async () => {
      await authed(ownerToken)
        .post(`/api/applications/${applicationId}/restore`)
        .expect(409);
    });
  });

  describe('snapshot append-only edit + delete', () => {
    it('edit creates a new revision; previous row unchanged; delete works', async () => {
      const createRes = await authed(ownerToken)
        .post(`/api/applications/${applicationId}/snapshots`)
        .send({ label: 'v1' })
        .expect(201);
      const originalId = createRes.body.id;
      const originalData = createRes.body.data;

      const revisionRes = await authed(ownerToken)
        .post(
          `/api/applications/${applicationId}/snapshots/${originalId}/revisions`,
        )
        .send({ label: 'v2' })
        .expect(201);

      expect(revisionRes.body.id).not.toBe(originalId);
      expect(revisionRes.body.supersedesSnapshotId).toBe(originalId);
      expect(revisionRes.body.label).toBe('v2');

      const originalAfter = await authed(ownerToken)
        .get(`/api/applications/${applicationId}/snapshots/${originalId}`)
        .expect(200);
      expect(originalAfter.body.label).toBe('v1');
      expect(originalAfter.body.data).toEqual(originalData);

      await authed(ownerToken)
        .delete(
          `/api/applications/${applicationId}/snapshots/${revisionRes.body.id}`,
        )
        .expect(204);

      await authed(ownerToken)
        .get(
          `/api/applications/${applicationId}/snapshots/${revisionRes.body.id}`,
        )
        .expect(404);
    });

    it('cross-user snapshot edit returns 404', async () => {
      const createRes = await authed(ownerToken)
        .post(`/api/applications/${applicationId}/snapshots`)
        .send({ label: 'private' })
        .expect(201);

      await authed(otherToken)
        .post(
          `/api/applications/${applicationId}/snapshots/${createRes.body.id}/revisions`,
        )
        .send({ label: 'stolen' })
        .expect(404);
    });
  });

  describe('AI suggestion confirm/reject', () => {
    it('suggest leaves status unchanged; confirm applies; reject clears', async () => {
      const reqRes = await authed(ownerToken)
        .post('/api/requirements')
        .send({
          applicationId,
          requirementType: RequirementType.LANGUAGE,
          description: 'English proficiency proof',
        })
        .expect(201);
      const reqId = reqRes.body.id;
      const beforeStatus = reqRes.body.status;

      const suggestRes = await authed(ownerToken)
        .post(`/api/requirements/${reqId}/ai-suggestion`)
        .expect(201);
      expect(suggestRes.body.status).toBe(beforeStatus);
      expect(suggestRes.body.suggestedStatus).toBeTruthy();

      await authed(ownerToken)
        .post(`/api/requirements/${reqId}/ai-suggestion/reject`)
        .expect(201);
      const rejected = await authed(ownerToken)
        .get(`/api/requirements/${reqId}`)
        .expect(200);
      expect(rejected.body.status).toBe(beforeStatus);
      expect(rejected.body.suggestedStatus).toBeNull();

      const suggest2 = await authed(ownerToken)
        .post(`/api/requirements/${reqId}/ai-suggestion`)
        .expect(201);
      const confirmed = await authed(ownerToken)
        .post(`/api/requirements/${reqId}/ai-suggestion/confirm`)
        .expect(201);
      expect(confirmed.body.status).toBe(suggest2.body.suggestedStatus);
      expect(confirmed.body.suggestedStatus).toBeNull();
    });
  });

  describe('role promotion', () => {
    it('USER cannot promote anyone; ADMIN can promote another USER', async () => {
      await authed(otherToken)
        .patch(`/api/users/${adminUserId}/role`)
        .send({ role: UserRole.ADMIN })
        .expect(403);

      const promoted = await authed(adminToken)
        .patch(`/api/users/${otherUserId}/role`)
        .send({ role: UserRole.ADMIN })
        .expect(200);
      expect(promoted.body.role).toBe(UserRole.ADMIN);
      expect(promoted.body.passwordHash).toBeUndefined();

      // Demote back so last-admin protections aren't tripped for other suites.
      await authed(adminToken)
        .patch(`/api/users/${otherUserId}/role`)
        .send({ role: UserRole.USER })
        .expect(200);
    });

    it('ADMIN cannot change their own role', async () => {
      await authed(adminToken)
        .patch(`/api/users/${adminUserId}/role`)
        .send({ role: UserRole.USER })
        .expect(403);
    });

    it('PATCH /users/me rejects role mass-assignment', async () => {
      await authed(otherToken)
        .patch('/api/users/me')
        .send({ role: UserRole.ADMIN })
        .expect(400);
    });
  });

  describe('URL fetch preview auth', () => {
    it('requires authentication', async () => {
      await request(testApp.app.getHttpServer())
        .post('/api/opportunity-sources/fetch-preview')
        .send({ url: 'https://example.com' })
        .expect(401);
    });

    it('rejects private URLs', async () => {
      await authed(ownerToken)
        .post('/api/opportunity-sources/fetch-preview')
        .send({ url: 'http://127.0.0.1/' })
        .expect(400);
    });
  });
});
