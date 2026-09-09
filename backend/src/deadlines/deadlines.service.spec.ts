import { DeadlinesService } from './deadlines.service';

/**
 * Covers the redundant-revalidation fix on `update()` (see its doc comment):
 * a link field that isn't changing must not be re-validated a second time —
 * `findOneAccessible` already proved the deadline's current links are valid
 * and owned by this user before `update()` even runs.
 */
describe('DeadlinesService — update() only re-validates changed links', () => {
  const userId = 'user-1';

  let deadlines: any;
  let opportunitiesService: any;
  let applicationsService: any;
  let tasksService: any;
  let requirementsService: any;
  let service: DeadlinesService;

  beforeEach(() => {
    const rows = new Map<string, any>();
    let nextId = 1;

    deadlines = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => {
        const withId = { id: row.id ?? `deadline-${nextId++}`, ...row };
        rows.set(withId.id, withId);
        return withId;
      }),
      findOne: jest.fn(async ({ where: { id } }: any) => rows.get(id) ?? null),
      find: jest.fn(async () => [...rows.values()]),
    };

    opportunitiesService = {
      findOneOrThrow: jest.fn(async (id: string) => ({ id })),
    };
    applicationsService = {
      findOwnedOrThrow: jest.fn(async (id: string) => ({
        id,
        journeyId: 'journey-1',
      })),
    };
    tasksService = {
      findOwnedOrThrow: jest.fn(async (id: string) => ({ id })),
    };
    requirementsService = {
      findOneAccessible: jest.fn(async (id: string) => ({ id })),
    };

    service = new DeadlinesService(
      deadlines,
      opportunitiesService,
      applicationsService,
      tasksService,
      requirementsService,
    );
  });

  /** Creates a deadline linked to one application, then clears mock call history. */
  async function seedDeadlineWithApplication(applicationId: string) {
    const deadline = await service.create(userId, {
      label: 'Submit application',
      date: '2027-01-01T00:00:00.000Z',
      applicationId,
    });
    jest.clearAllMocks(); // only interested in calls made by update() from here on
    return deadline;
  }

  it('updating only label/date does not re-validate the unchanged applicationId', async () => {
    const deadline = await seedDeadlineWithApplication('app-1');

    await service.update(deadline.id, userId, {
      label: 'Submit application (renamed)',
      date: '2027-02-01T00:00:00.000Z',
    });

    // Exactly one call — from findOneAccessible's own check of the current
    // link. No second call for the same, unchanged value.
    expect(applicationsService.findOwnedOrThrow).toHaveBeenCalledTimes(1);
  });

  it('submitting the same applicationId again does not trigger an extra ownership check', async () => {
    const deadline = await seedDeadlineWithApplication('app-1');

    await service.update(deadline.id, userId, {
      applicationId: 'app-1',
    });

    expect(applicationsService.findOwnedOrThrow).toHaveBeenCalledTimes(1);
  });

  it('submitting a different applicationId triggers a fresh ownership check for the new value', async () => {
    const deadline = await seedDeadlineWithApplication('app-1');

    await service.update(deadline.id, userId, {
      applicationId: 'app-2',
    });

    // Once for the current value (app-1, via findOneAccessible) and once more
    // for the new value (app-2) — the new link genuinely needs validating.
    expect(applicationsService.findOwnedOrThrow).toHaveBeenCalledTimes(2);
    expect(applicationsService.findOwnedOrThrow).toHaveBeenCalledWith(
      'app-2',
      userId,
    );
  });
});

/**
 * Track 1 Group B / I1 fix — the up-to-4 independent link checks in
 * validateAndAuthorizeLinks() previously ran sequentially; now concurrent
 * via Promise.all (same pattern as Track 1 Group A's Checkpoint 5).
 */
describe('DeadlinesService — create() validates independent links concurrently', () => {
  it('does not wait for the applicationId check before starting the taskId check', async () => {
    const deadlines = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => ({ id: 'deadline-1', ...row })),
    };
    const opportunitiesService = { findOneOrThrow: jest.fn() };
    let applicationResolved = false;
    const applicationsService = {
      findOwnedOrThrow: jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        applicationResolved = true;
        return { id: 'app-1' };
      }),
    };
    const tasksService = {
      findOwnedOrThrow: jest.fn(async () => {
        // If these ran sequentially (application awaited first), this
        // would already be true by the time this check starts — proving
        // concurrency, not just eventual correctness.
        expect(applicationResolved).toBe(false);
        return { id: 'task-1' };
      }),
    };
    const requirementsService = { findOneAccessible: jest.fn() };

    const service = new DeadlinesService(
      deadlines as any,
      opportunitiesService as any,
      applicationsService as any,
      tasksService as any,
      requirementsService as any,
    );

    await service.create('user-1', {
      label: 'Submit application',
      date: '2027-01-01T00:00:00.000Z',
      applicationId: 'app-1',
      taskId: 'task-1',
    });

    expect(applicationsService.findOwnedOrThrow).toHaveBeenCalledTimes(1);
    expect(tasksService.findOwnedOrThrow).toHaveBeenCalledTimes(1);
  });
});
