import { NotFoundException } from '@nestjs/common';
import { User } from '../../src/users/entities/user.entity';
import { ApplicationJourney } from '../../src/journeys/entities/application-journey.entity';
import { Application } from '../../src/applications/entities/application.entity';
import { Task } from '../../src/tasks/entities/task.entity';
import { TasksService } from '../../src/tasks/tasks.service';
import { setupDbIntegrationTest } from './db-test-helper';

/**
 * Track 2, §0 — product rule: a soft-deleted Application's Tasks must not
 * remain normally retrievable. Uses the REAL `TasksService` (only
 * `journeysService`/`applicationsService`/`requirementsService` are stubs —
 * this test targets the read paths, `findOwnedOrThrow()`/`findAllForUser()`,
 * which don't call any of those) bound to real, transaction-scoped
 * repositories against real Postgres — the same DB-integration harness
 * used throughout Batch 12.
 *
 * This is exactly the layer that caught a real bug in the first version of
 * this fix: a unit test with a hand-rolled query-builder mock could not
 * have caught it (the mock doesn't replicate TypeORM's own automatic
 * `@DeleteDateColumn`-on-JOIN-condition behavior — see tasks.service.ts's
 * doc comment on `findWithJourneyOrThrow()` for the full account). Real
 * Postgres, real generated SQL, is what actually proved this correct.
 */
describe('Soft-deleted Application hides its Tasks (real Postgres)', () => {
  const harness = setupDbIntegrationTest();
  beforeAll(harness.beforeAll);
  afterAll(harness.afterAll);
  beforeEach(harness.beforeEach);
  afterEach(harness.afterEach);

  const makeService = () => {
    const { manager } = harness.getContext();
    return new TasksService(
      manager.getRepository(Task),
      { findOwnedOrThrow: jest.fn() } as any,
      { findOwnedOrThrow: jest.fn() } as any,
      { findOneAccessible: jest.fn() } as any,
      {
        get: jest.fn(() => ({ defaultPageSize: 25, maxPageSize: 100 })),
      } as any,
    );
  };

  const seed = async () => {
    const { manager } = harness.getContext();
    const users = manager.getRepository(User);
    const journeys = manager.getRepository(ApplicationJourney);
    const applications = manager.getRepository(Application);
    const tasks = manager.getRepository(Task);

    const user = await users.save(
      users.create({
        email: `soft-delete-task-${Math.random()}@example.invalid`,
        passwordHash: 'not-a-real-hash',
      }),
    );
    const journey = await journeys.save(
      journeys.create({ userId: user.id, title: 'Test Journey' }),
    );
    const application = await applications.save(
      applications.create({ journeyId: journey.id, title: 'Test Application' }),
    );
    const taskOnApplication = await tasks.save(
      tasks.create({
        journeyId: journey.id,
        applicationId: application.id,
        title: 'Task tied to the application',
      }),
    );
    const journeyLevelTask = await tasks.save(
      tasks.create({
        journeyId: journey.id,
        applicationId: null,
        title: 'Journey-level task, no application',
      }),
    );

    return { user, journey, application, taskOnApplication, journeyLevelTask };
  };

  it('findOwnedOrThrow(): 404s for a Task whose Application is soft-deleted', async () => {
    const { user, application, taskOnApplication } = await seed();
    const { manager } = harness.getContext();
    await manager.softDelete(Application, application.id);

    const service = makeService();
    await expect(
      service.findOwnedOrThrow(taskOnApplication.id, user.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findOwnedOrThrow(): still finds the same Task normally before the Application is deleted', async () => {
    const { user, taskOnApplication } = await seed();
    const service = makeService();

    const found = await service.findOwnedOrThrow(taskOnApplication.id, user.id);
    expect(found.id).toBe(taskOnApplication.id);
  });

  it('findOwnedOrThrow(): a journey-level Task (no Application) is unaffected by any Application being soft-deleted', async () => {
    const { user, application, journeyLevelTask } = await seed();
    const { manager } = harness.getContext();
    await manager.softDelete(Application, application.id);

    const service = makeService();
    const found = await service.findOwnedOrThrow(journeyLevelTask.id, user.id);
    expect(found.id).toBe(journeyLevelTask.id);
  });

  it('findAllForUser(): excludes a Task whose Application is soft-deleted, even when filtered only by journeyId', async () => {
    const { user, journey, application, taskOnApplication, journeyLevelTask } =
      await seed();
    const { manager } = harness.getContext();
    await manager.softDelete(Application, application.id);

    const service = makeService();
    const result = await service.findAllForUser(
      user.id,
      { journeyId: journey.id },
      {},
    );
    const ids = result.items.map((t) => t.id);
    expect(ids).not.toContain(taskOnApplication.id);
    expect(ids).toContain(journeyLevelTask.id);
  });

  it('findAllForUser(): includes the Task normally before the Application is deleted', async () => {
    const { user, journey, taskOnApplication } = await seed();
    const service = makeService();

    const result = await service.findAllForUser(
      user.id,
      { journeyId: journey.id },
      {},
    );
    expect(result.items.map((t) => t.id)).toContain(taskOnApplication.id);
  });
});
