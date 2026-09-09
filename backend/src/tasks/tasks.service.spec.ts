import { TaskDependencyType, TaskStatus } from '../types';
import { TasksService } from './tasks.service';

/**
 * Covers the guarantee documented on Task.dependsOnTaskId/dependencyType
 * (see task.entity.ts): dependency metadata is informational only and must
 * NEVER block a status change, even a "hard" dependency on an unfinished task.
 */
describe('TasksService — dependency metadata is never enforced', () => {
  const userId = 'user-1';
  const journey = { id: 'journey-1', userId };

  let tasks: any;
  let journeysService: any;
  let applicationsService: any;
  let requirementsService: any;
  let service: TasksService;

  beforeEach(() => {
    const rows = new Map<string, any>();
    let nextId = 1;
    tasks = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => {
        const withId = { id: row.id ?? `task-${nextId++}`, journey, ...row };
        rows.set(withId.id, withId);
        return withId;
      }),
      findOne: jest.fn(async ({ where: { id } }: any) => rows.get(id) ?? null),
      find: jest.fn(async () => [...rows.values()]),
    };
    journeysService = { findOwnedOrThrow: jest.fn(async () => journey) };
    applicationsService = { findOwnedOrThrow: jest.fn() };
    requirementsService = { findOneAccessible: jest.fn() };

    service = new TasksService(
      tasks,
      journeysService,
      applicationsService,
      requirementsService,
    );
  });

  it('lets a task be marked DONE while its HARD dependency is still incomplete', async () => {
    const dependency = await service.create(userId, {
      journeyId: journey.id,
      title: 'Request recommendation letters',
    });
    expect(dependency.status).not.toBe(TaskStatus.DONE);

    const dependent = await service.create(userId, {
      journeyId: journey.id,
      title: 'Write personal statement',
      dependsOnTaskId: dependency.id,
      dependencyType: TaskDependencyType.HARD,
    });

    // The dependency (`dependency`) is still TODO — a real block would reject this.
    const updated = await service.update(dependent.id, userId, {
      status: TaskStatus.DONE,
    });

    expect(updated.status).toBe(TaskStatus.DONE);
    expect(updated.completedAt).toBeInstanceOf(Date);
  });

  it('defaults dependencyType to SOFT when a dependsOnTaskId is set without one', async () => {
    const dependency = await service.create(userId, {
      journeyId: journey.id,
      title: 'Dependency',
    });
    const dependent = await service.create(userId, {
      journeyId: journey.id,
      title: 'Dependent',
      dependsOnTaskId: dependency.id,
    });

    expect(dependent.dependencyType).toBe(TaskDependencyType.SOFT);
  });

  it('clears completedAt when a DONE task is moved back to another status', async () => {
    const task = await service.create(userId, {
      journeyId: journey.id,
      title: 'Some task',
    });
    const done = await service.update(task.id, userId, {
      status: TaskStatus.DONE,
    });
    expect(done.completedAt).toBeInstanceOf(Date);

    const reopened = await service.update(task.id, userId, {
      status: TaskStatus.IN_PROGRESS,
    });
    expect(reopened.completedAt).toBeNull();
  });
});

/**
 * Covers the Promise.all parallelization in create()/update(): running the
 * independent checks concurrently must not skip any of them, and a failure in
 * any single one must still be reported correctly.
 */
describe('TasksService — parallelized validation checks', () => {
  const userId = 'user-1';
  const journey = { id: 'journey-1', userId };

  let tasks: any;
  let journeysService: any;
  let applicationsService: any;
  let requirementsService: any;
  let service: TasksService;

  beforeEach(() => {
    let nextId = 1;
    tasks = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => ({
        id: row.id ?? `task-${nextId++}`,
        journey,
        ...row,
      })),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    journeysService = { findOwnedOrThrow: jest.fn(async () => journey) };
    applicationsService = {
      findOwnedOrThrow: jest.fn(async (id: string) => ({
        id,
        journeyId: journey.id,
      })),
    };
    requirementsService = {
      findOneAccessible: jest.fn(async (id: string) => ({ id })),
    };

    service = new TasksService(
      tasks,
      journeysService,
      applicationsService,
      requirementsService,
    );
  });

  it('validates both applicationId and requirementId when both are provided', async () => {
    await service.create(userId, {
      journeyId: journey.id,
      title: 'Upload transcript',
      applicationId: 'app-1',
      requirementId: 'req-1',
    });

    expect(applicationsService.findOwnedOrThrow).toHaveBeenCalledWith(
      'app-1',
      userId,
    );
    expect(requirementsService.findOneAccessible).toHaveBeenCalledWith(
      'req-1',
      userId,
    );
  });

  it('still rejects when applicationId belongs to a different journey than dto.journeyId', async () => {
    applicationsService.findOwnedOrThrow.mockResolvedValueOnce({
      id: 'app-1',
      journeyId: 'a-different-journey',
    });

    await expect(
      service.create(userId, {
        journeyId: journey.id,
        title: 'Upload transcript',
        applicationId: 'app-1',
      } as any),
    ).rejects.toThrow('applicationId does not belong to the given journeyId');
  });

  it('still rejects when the journey check fails, even though the other checks would have passed', async () => {
    journeysService.findOwnedOrThrow.mockRejectedValueOnce(
      new Error('journey not owned'),
    );

    await expect(
      service.create(userId, {
        journeyId: 'someone-elses-journey',
        title: 'Upload transcript',
        applicationId: 'app-1',
        requirementId: 'req-1',
      } as any),
    ).rejects.toThrow('journey not owned');
  });
});

/**
 * Track 1 Group C / I3, C2 — dependsOnTaskId scope validation. A dependency
 * target must live in the same scope as the dependent task: same
 * Application (when the dependent is application-scoped) or same Journey
 * (when the dependent is journey-level, with the target itself also
 * journey-level — never application-scoped). Self-dependency is always
 * rejected regardless of scope.
 */
describe('TasksService — dependency scope validation (C2)', () => {
  const userId = 'user-1';

  let tasks: any;
  let journeysService: any;
  let applicationsService: any;
  let requirementsService: any;
  let service: TasksService;

  beforeEach(() => {
    const rows = new Map<string, any>();
    let nextId = 1;
    tasks = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => {
        const withId = {
          id: row.id ?? `task-${nextId++}`,
          journey: { id: row.journeyId, userId },
          ...row,
        };
        rows.set(withId.id, withId);
        return withId;
      }),
      findOne: jest.fn(async ({ where: { id } }: any) => rows.get(id) ?? null),
      find: jest.fn(async () => [...rows.values()]),
    };
    // Echoes back whichever journeyId is requested, scoped to this user —
    // lets a single test span multiple distinct journeys.
    journeysService = {
      findOwnedOrThrow: jest.fn(async (id: string) => ({ id, userId })),
    };
    applicationsService = {
      findOwnedOrThrow: jest.fn(async (id: string) => ({
        id,
        journeyId: 'journey-1',
      })),
    };
    requirementsService = { findOneAccessible: jest.fn() };

    service = new TasksService(
      tasks,
      journeysService,
      applicationsService,
      requirementsService,
    );
  });

  it('rejects a task depending on itself, via update()', async () => {
    // Self-dependency is only reachable through update(): a client can never
    // predict a not-yet-created task's server-generated id, so create()'s
    // own defensive check (validateDependencyScope's `dependentTaskId`
    // guard) can't be exercised from a create() call — only update()'s.
    const task = await service.create(userId, {
      journeyId: 'journey-1',
      title: 'Solo task',
    });

    await expect(
      service.update(task.id, userId, { dependsOnTaskId: task.id } as any),
    ).rejects.toThrow('A task cannot depend on itself');
  });

  it('accepts a dependency between two tasks under the SAME Application', async () => {
    const dependency = await service.create(userId, {
      journeyId: 'journey-1',
      title: 'Collect references',
      applicationId: 'app-1',
    });

    const dependent = await service.create(userId, {
      journeyId: 'journey-1',
      title: 'Submit application',
      applicationId: 'app-1',
      dependsOnTaskId: dependency.id,
    });

    expect(dependent.dependsOnTaskId).toBe(dependency.id);
  });

  it('rejects a dependency on a task belonging to a DIFFERENT Application', async () => {
    const dependency = await service.create(userId, {
      journeyId: 'journey-1',
      title: 'Task under app-1',
      applicationId: 'app-1',
    });

    await expect(
      service.create(userId, {
        journeyId: 'journey-1',
        title: 'Task under app-2',
        applicationId: 'app-2',
        dependsOnTaskId: dependency.id,
      } as any),
    ).rejects.toThrow(
      'dependsOnTaskId must reference a task belonging to the same Application',
    );
  });

  it('accepts a dependency between two journey-level tasks under the SAME Journey', async () => {
    const dependency = await service.create(userId, {
      journeyId: 'journey-1',
      title: 'Journey-level dependency',
    });

    const dependent = await service.create(userId, {
      journeyId: 'journey-1',
      title: 'Journey-level dependent',
      dependsOnTaskId: dependency.id,
    });

    expect(dependent.dependsOnTaskId).toBe(dependency.id);
  });

  it('rejects a journey-level dependency reaching into a DIFFERENT Journey', async () => {
    const dependency = await service.create(userId, {
      journeyId: 'journey-1',
      title: 'Task under journey-1',
    });

    await expect(
      service.create(userId, {
        journeyId: 'journey-2',
        title: 'Task under journey-2',
        dependsOnTaskId: dependency.id,
      } as any),
    ).rejects.toThrow(
      'dependsOnTaskId must reference a task belonging to the same Journey',
    );
  });

  it('rejects a journey-level task depending on an application-scoped task', async () => {
    const dependency = await service.create(userId, {
      journeyId: 'journey-1',
      title: 'Application-scoped task',
      applicationId: 'app-1',
    });

    await expect(
      service.create(userId, {
        journeyId: 'journey-1',
        title: 'Journey-level task',
        dependsOnTaskId: dependency.id,
      } as any),
    ).rejects.toThrow(
      'A journey-level task cannot depend on an application-scoped task',
    );
  });

  it('enforces ownership of the dependency target itself (not just the dependent task)', async () => {
    // findOwnedOrThrow() on a nonexistent id throws NotFoundException before
    // scope validation is ever reached.
    await expect(
      service.create(userId, {
        journeyId: 'journey-1',
        title: 'Depends on a task that does not exist',
        dependsOnTaskId: 'nonexistent-task',
      } as any),
    ).rejects.toThrow('Task not found');
  });

  it('allows clearing an existing dependency by sending dependsOnTaskId: null', async () => {
    const dependency = await service.create(userId, {
      journeyId: 'journey-1',
      title: 'Dependency',
    });
    const dependent = await service.create(userId, {
      journeyId: 'journey-1',
      title: 'Dependent',
      dependsOnTaskId: dependency.id,
    });
    expect(dependent.dependencyType).toBe(TaskDependencyType.SOFT);

    const cleared = await service.update(dependent.id, userId, {
      dependsOnTaskId: null,
    });

    expect(cleared.dependsOnTaskId).toBeNull();
    expect(cleared.dependencyType).toBeNull();
  });

  it('rejects dependencyType being set on create() without a dependsOnTaskId', async () => {
    await expect(
      service.create(userId, {
        journeyId: 'journey-1',
        title: 'Task',
        dependencyType: TaskDependencyType.HARD,
      } as any),
    ).rejects.toThrow('dependencyType requires a dependsOnTaskId');
  });

  it('rejects dependencyType being set on update() when there is no dependsOnTaskId (neither existing nor newly provided)', async () => {
    const task = await service.create(userId, {
      journeyId: 'journey-1',
      title: 'Task with no dependency',
    });

    await expect(
      service.update(task.id, userId, {
        dependencyType: TaskDependencyType.HARD,
      } as any),
    ).rejects.toThrow('dependencyType requires a dependsOnTaskId');
  });
});

/**
 * Track 1 Group C / C2.5 — update() cross-consistency: applicationId and
 * journeyId (whichever is unchanged) must still agree with each other after
 * applying whichever field the PATCH actually changed.
 */
describe('TasksService — update() cross-consistency (C2.5)', () => {
  const userId = 'user-1';
  const journey = { id: 'journey-1', userId };

  let tasks: any;
  let journeysService: any;
  let applicationsService: any;
  let requirementsService: any;
  let service: TasksService;

  beforeEach(() => {
    const rows = new Map<string, any>();
    rows.set('task-1', {
      id: 'task-1',
      journeyId: 'journey-1',
      journey,
      applicationId: 'app-1',
      title: 'Existing task',
    });

    tasks = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => {
        rows.set(row.id, row);
        return row;
      }),
      findOne: jest.fn(async ({ where: { id } }: any) => rows.get(id) ?? null),
      find: jest.fn(),
    };
    journeysService = {
      findOwnedOrThrow: jest.fn(async (id: string) => ({ id, userId })),
    };
    applicationsService = {
      // app-1 belongs to journey-1 — the ORIGINAL journey, not any journey a
      // test attempts to move the task to.
      findOwnedOrThrow: jest.fn(async (id: string) => ({
        id,
        journeyId: 'journey-1',
      })),
    };
    requirementsService = { findOneAccessible: jest.fn() };

    service = new TasksService(
      tasks,
      journeysService,
      applicationsService,
      requirementsService,
    );
  });

  it('rejects moving an application-scoped task to a different journeyId while its applicationId stays the same', async () => {
    // task-1 keeps applicationId 'app-1', which is still tied to journey-1 —
    // attempting to move journeyId alone leaves the two inconsistent.
    await expect(
      service.update('task-1', userId, { journeyId: 'journey-2' } as any),
    ).rejects.toThrow('applicationId does not belong to the given journeyId');
  });

  it('accepts moving journeyId and applicationId together, to a still-consistent pair', async () => {
    applicationsService.findOwnedOrThrow.mockResolvedValueOnce({
      id: 'app-2',
      journeyId: 'journey-2',
    });

    const updated = await service.update('task-1', userId, {
      journeyId: 'journey-2',
      applicationId: 'app-2',
    });

    expect(updated.journeyId).toBe('journey-2');
    expect(updated.applicationId).toBe('app-2');
  });

  it('accepts an unrelated field update that leaves journeyId/applicationId untouched', async () => {
    const updated = await service.update('task-1', userId, {
      title: 'Renamed task',
    });

    expect(updated.title).toBe('Renamed task');
    expect(applicationsService.findOwnedOrThrow).not.toHaveBeenCalled();
  });
});
