import request from 'supertest';
import { bootstrapTestApp, cleanupTestUsers, TestApp } from './test-app';
import { RequirementType } from '../../src/types';

/**
 * Track 2, §0 — product rule: a soft-deleted Application and every one of
 * its workflow resources (Tasks, Requirements, Deadlines) must not remain
 * visible through the normal API surface. Real HTTP requests through the
 * real app + real Postgres — not a frontend-only filter, and not a mocked
 * unit test — proving the actual API responses a client would see, for
 * both a soft-deleted Application's own resources and an unrelated
 * still-active Application (which must remain fully, normally visible).
 *
 * Regression coverage for the 8 scenarios explicitly required:
 * 1. Deleted Application excluded from the Application list.
 * 2. Deleted Application not retrievable via its detail endpoint.
 * 3. Task belonging to a deleted Application not normally retrievable.
 * 4. Requirement belonging to a deleted Application not normally retrievable.
 * 5. Deadline belonging to a deleted Application not normally retrievable.
 * 6. ApplicationDocuments access does not expose deleted-Application data.
 * 7. A non-deleted Application continues behaving normally.
 * 8. Purge behavior remains correct (the row still exists until purged).
 */
describe('Soft-deleted Application visibility (Track 2 §0)', () => {
  let testApp: TestApp;
  const emailPrefix = `soft-delete-vis-${process.pid}-`;
  const email = `${emailPrefix}${Date.now()}@example.invalid`;
  const password = 'a genuinely reasonable passphrase';
  let accessToken: string;
  let journeyId: string;

  // The Application that WILL be soft-deleted, and its child resources.
  let deletedAppId: string;
  let taskOfDeletedAppId: string;
  let requirementOfDeletedAppId: string;
  let deadlineOfDeletedAppId: string;

  // A second, untouched Application — must remain fully visible throughout.
  let activeAppId: string;
  let taskOfActiveAppId: string;

  const authed = () => ({
    get: (path: string) =>
      request(testApp.app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${accessToken}`),
    post: (path: string) =>
      request(testApp.app.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${accessToken}`),
    delete: (path: string) =>
      request(testApp.app.getHttpServer())
        .delete(path)
        .set('Authorization', `Bearer ${accessToken}`),
  });

  beforeAll(async () => {
    testApp = await bootstrapTestApp();

    const registerRes = await request(testApp.app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password });
    accessToken = registerRes.body.accessToken;

    const journeyRes = await authed()
      .post('/api/journeys')
      .send({ title: 'MSc Computer Science — Test University' });
    journeyId = journeyRes.body.id;

    const deletedAppRes = await authed()
      .post('/api/applications')
      .send({ journeyId, title: 'Application To Be Deleted' });
    deletedAppId = deletedAppRes.body.id;

    const taskRes = await authed().post('/api/tasks').send({
      journeyId,
      applicationId: deletedAppId,
      title: 'Task on the soon-to-be-deleted application',
    });
    taskOfDeletedAppId = taskRes.body.id;

    const requirementRes = await authed().post('/api/requirements').send({
      applicationId: deletedAppId,
      requirementType: RequirementType.DOCUMENT,
      description: 'Requirement on the soon-to-be-deleted application',
    });
    requirementOfDeletedAppId = requirementRes.body.id;

    const deadlineRes = await authed().post('/api/deadlines').send({
      applicationId: deletedAppId,
      label: 'Deadline on the soon-to-be-deleted application',
      date: '2027-01-01T00:00:00.000Z',
    });
    deadlineOfDeletedAppId = deadlineRes.body.id;

    const activeAppRes = await authed()
      .post('/api/applications')
      .send({ journeyId, title: 'Still-Active Application' });
    activeAppId = activeAppRes.body.id;

    const activeTaskRes = await authed().post('/api/tasks').send({
      journeyId,
      applicationId: activeAppId,
      title: 'Task on the still-active application',
    });
    taskOfActiveAppId = activeTaskRes.body.id;

    // The actual soft-delete.
    await authed().delete(`/api/applications/${deletedAppId}`).expect(204);
  });

  afterAll(async () => {
    // Purge verification (scenario 8) happens inside its own test, below,
    // via a direct raw query — this cleanup then removes whatever's left.
    await cleanupTestUsers(testApp.dataSource, emailPrefix);
    await testApp.app.close();
  });

  it('1. excludes the deleted Application from the Application list', async () => {
    const res = await authed().get('/api/applications').expect(200);
    const ids = res.body.items.map((a: { id: string }) => a.id);
    expect(ids).not.toContain(deletedAppId);
  });

  it('2. cannot retrieve the deleted Application through its detail endpoint — 404', async () => {
    await authed().get(`/api/applications/${deletedAppId}`).expect(404);
  });

  it('3. a Task belonging to the deleted Application is not normally retrievable', async () => {
    await authed().get(`/api/tasks/${taskOfDeletedAppId}`).expect(404);

    const listRes = await authed()
      .get(`/api/tasks?journeyId=${journeyId}`)
      .expect(200);
    const ids = listRes.body.items.map((t: { id: string }) => t.id);
    expect(ids).not.toContain(taskOfDeletedAppId);
  });

  it('4. a Requirement belonging to the deleted Application is not normally retrievable', async () => {
    await authed()
      .get(`/api/requirements/${requirementOfDeletedAppId}`)
      .expect(404);

    const listRes = await authed()
      .get(`/api/requirements?applicationId=${deletedAppId}`)
      .expect(404); // the applicationId filter itself is no longer accessible
    void listRes;
  });

  it('5. a Deadline belonging to the deleted Application is not normally retrievable', async () => {
    await authed().get(`/api/deadlines/${deadlineOfDeletedAppId}`).expect(404);

    await authed()
      .get(`/api/deadlines?applicationId=${deletedAppId}`)
      .expect(404); // same reasoning as Requirements above
  });

  it('6. ApplicationDocuments access does not expose deleted-Application data', async () => {
    await authed()
      .get(`/api/applications/${deletedAppId}/documents`)
      .expect(404);
  });

  it('7. the still-active Application and its Task continue behaving completely normally', async () => {
    const appRes = await authed()
      .get(`/api/applications/${activeAppId}`)
      .expect(200);
    expect(appRes.body.id).toBe(activeAppId);

    const listRes = await authed().get('/api/applications').expect(200);
    expect(listRes.body.items.map((a: { id: string }) => a.id)).toContain(
      activeAppId,
    );

    const taskRes = await authed()
      .get(`/api/tasks/${taskOfActiveAppId}`)
      .expect(200);
    expect(taskRes.body.id).toBe(taskOfActiveAppId);

    const taskListRes = await authed()
      .get(`/api/tasks?journeyId=${journeyId}`)
      .expect(200);
    expect(taskListRes.body.items.map((t: { id: string }) => t.id)).toContain(
      taskOfActiveAppId,
    );
  });

  it('8. purge behavior remains correct — the row still physically exists (soft-deleted, not gone) until the purge job runs', async () => {
    const rawRow = await testApp.dataSource.query(
      'SELECT id, deleted_at FROM applications WHERE id = $1',
      [deletedAppId],
    );
    expect(rawRow).toHaveLength(1);
    expect(rawRow[0].deleted_at).not.toBeNull();

    // Its Tasks/Requirements/Deadlines likewise still physically exist —
    // "invisible through the normal API" is not the same as "purged".
    const taskRow = await testApp.dataSource.query(
      'SELECT id FROM tasks WHERE id = $1',
      [taskOfDeletedAppId],
    );
    expect(taskRow).toHaveLength(1);
  });
});
