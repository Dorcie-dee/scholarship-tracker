import { TaskDependencyType, TaskStatus } from '../types';
import { TasksService } from './tasks.service';

// Shared across every describe block below — TasksService's constructor
// gained a ConfigService dependency (Batch 4, pagination) that none of
// these pre-existing describe blocks otherwise need to configure.
const configServiceMock = {
  get: jest.fn(() => ({ defaultPageSize: 25, maxPageSize: 100 })),
} as any;

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
      createQueryBuilder: jest.fn(() => {
        let targetId: string | undefined;
        const builder: any = {
          innerJoinAndSelect: jest.fn(() => builder),
          leftJoin: jest.fn(() => builder),
          where: jest.fn((_sql: string, params: { id: string }) => {
            targetId = params.id;
            return builder;
          }),
          andWhere: jest.fn(() => builder),
          getOne: jest.fn(async () =>
            targetId ? (rows.get(targetId) ?? null) : null,
          ),
        };
        return builder;
      }),
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
      configServiceMock,
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
      configServiceMock,
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
      createQueryBuilder: jest.fn(() => {
        let targetId: string | undefined;
        const builder: any = {
          innerJoinAndSelect: jest.fn(() => builder),
          leftJoin: jest.fn(() => builder),
          where: jest.fn((_sql: string, params: { id: string }) => {
            targetId = params.id;
            return builder;
          }),
          andWhere: jest.fn(() => builder),
          getOne: jest.fn(async () =>
            targetId ? (rows.get(targetId) ?? null) : null,
          ),
        };
        return builder;
      }),
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
      configServiceMock,
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
      createQueryBuilder: jest.fn(() => {
        let targetId: string | undefined;
        const builder: any = {
          innerJoinAndSelect: jest.fn(() => builder),
          leftJoin: jest.fn(() => builder),
          where: jest.fn((_sql: string, params: { id: string }) => {
            targetId = params.id;
            return builder;
          }),
          andWhere: jest.fn(() => builder),
          getOne: jest.fn(async () =>
            targetId ? (rows.get(targetId) ?? null) : null,
          ),
        };
        return builder;
      }),
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
      configServiceMock,
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

/**
 * Track 1 Group E (E2) — ownership failures normalize to 404, uniformly with
 * "doesn't exist at all" — see common/utils/ownership.ts's doc comment. Uses
 * the REAL findOwnedOrThrow()/assertOwnership() path.
 */
describe('TasksService — ownership normalizes to 404 (Track 1 Group E)', () => {
  const ownerId = 'user-1';
  const otherUserId = 'user-2';

  let tasks: any;
  let service: TasksService;

  beforeEach(() => {
    const rows = new Map<string, any>([
      ['task-owned', { id: 'task-owned', journey: { userId: ownerId } }],
      [
        'task-foreign',
        { id: 'task-foreign', journey: { userId: otherUserId } },
      ],
    ]);
    tasks = {
      save: jest.fn(async (row: any) => row),
      findOne: jest.fn(async ({ where: { id } }: any) => rows.get(id) ?? null),
      createQueryBuilder: jest.fn(() => {
        let targetId: string | undefined;
        const builder: any = {
          innerJoinAndSelect: jest.fn(() => builder),
          leftJoin: jest.fn(() => builder),
          where: jest.fn((_sql: string, params: { id: string }) => {
            targetId = params.id;
            return builder;
          }),
          andWhere: jest.fn(() => builder),
          getOne: jest.fn(async () =>
            targetId ? (rows.get(targetId) ?? null) : null,
          ),
        };
        return builder;
      }),
      delete: jest.fn(async (id: string) => {
        rows.delete(id);
      }),
    };
    service = new TasksService(
      tasks,
      {} as any,
      {} as any,
      {} as any,
      configServiceMock,
    );
  });

  it('a foreign-owned task 404s, not 403s', async () => {
    await expect(
      service.findOwnedOrThrow('task-foreign', ownerId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('a nonexistent task also 404s, identically', async () => {
    await expect(
      service.findOwnedOrThrow('task-does-not-exist', ownerId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('the legitimate owner can still access their own task', async () => {
    const task = await service.findOwnedOrThrow('task-owned', ownerId);
    expect(task.id).toBe('task-owned');
  });

  it('remove() on a foreign-owned task 404s and deletes nothing', async () => {
    await expect(service.remove('task-foreign', ownerId)).rejects.toMatchObject(
      { status: 404 },
    );
    expect(tasks.delete).not.toHaveBeenCalled();
  });
});

/** Production hardening (Batch 4) — findAllForUser() is keyset-paginated and stays journey-userId-scoped. */
describe('TasksService — findAllForUser pagination (Batch 4)', () => {
  const ownerId = 'user-1';
  let tasks: any;
  let service: TasksService;

  beforeEach(() => {
    const rows = [
      {
        id: 't-1',
        journeyUserId: ownerId,
        applicationId: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 't-2',
        journeyUserId: ownerId,
        applicationId: 'app-1',
        createdAt: new Date('2026-02-01T00:00:00Z'),
      },
      {
        id: 't-3',
        journeyUserId: 'user-2',
        applicationId: null,
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
    ];
    const qb: any = {
      innerJoin: jest.fn(() => qb),
      leftJoin: jest.fn(() => qb),
      andWhere: jest.fn((_sql: string, params: any) => {
        qb.__where = { ...(qb.__where ?? {}), ...params };
        return qb;
      }),
      orderBy: jest.fn(() => qb),
      addOrderBy: jest.fn(() => qb),
      take: jest.fn(() => qb),
      getMany: jest.fn(async () =>
        rows
          .filter((r) => r.journeyUserId === qb.__where.userId)
          .filter((r) =>
            qb.__where.applicationId
              ? r.applicationId === qb.__where.applicationId
              : true,
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      ),
    };
    tasks = { createQueryBuilder: jest.fn(() => qb) };
    service = new TasksService(
      tasks,
      {} as any,
      {} as any,
      {} as any,
      configServiceMock,
    );
  });

  it("only returns tasks belonging to the requesting user's own journeys", async () => {
    const result = await service.findAllForUser(ownerId, {}, {});
    expect(result.items.map((r: any) => r.id).sort()).toEqual(['t-1', 't-2']);
  });

  it('additionally filters by applicationId, still within the owned set', async () => {
    const result = await service.findAllForUser(
      ownerId,
      { applicationId: 'app-1' },
      {},
    );
    expect(result.items.map((r: any) => r.id)).toEqual(['t-2']);
  });
});

/**
 * Track 2, §0 — product rule: a soft-deleted Application's Tasks must not
 * remain normally retrievable, even though a Task's own ownership anchor is
 * its Journey (never soft-deleted itself). These mocks model the real SQL
 * shape (`(task.applicationId IS NULL OR application.deletedAt IS NULL)`)
 * rather than ignoring it, unlike the other describe blocks in this file
 * (which don't exercise this behavior at all) — see tasks.service.ts's
 * `findWithJourneyOrThrow()`/`findAllForUser()` doc comments.
 */
describe('TasksService — soft-deleted Application hides its Tasks (Track 2 §0)', () => {
  const ownerId = 'user-1';

  const makeRows = () => [
    {
      id: 'task-no-app',
      journeyId: 'journey-1',
      journeyUserId: ownerId,
      applicationId: null,
      application: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 'task-active-app',
      journeyId: 'journey-1',
      journeyUserId: ownerId,
      applicationId: 'app-active',
      application: { id: 'app-active', deletedAt: null },
      createdAt: new Date('2026-02-01T00:00:00Z'),
    },
    {
      id: 'task-deleted-app',
      journeyId: 'journey-1',
      journeyUserId: ownerId,
      applicationId: 'app-deleted',
      application: {
        id: 'app-deleted',
        deletedAt: new Date('2026-03-01T00:00:00Z'),
      },
      createdAt: new Date('2026-03-01T00:00:00Z'),
    },
  ];

  // Faithfully evaluates the production WHERE clause
  // `(task.applicationId IS NULL OR application.deletedAt IS NULL)` against
  // the mocked rows, rather than assuming the code is correct.
  const passesApplicationVisibilityFilter = (row: any) =>
    row.applicationId === null || row.application?.deletedAt == null;

  describe('findOwnedOrThrow (single-record lookup)', () => {
    let tasks: any;
    let service: TasksService;

    beforeEach(() => {
      const rows = new Map(makeRows().map((r) => [r.id, r]));
      tasks = {
        createQueryBuilder: jest.fn(() => {
          let targetId: string | undefined;
          const builder: any = {
            innerJoinAndSelect: jest.fn(() => builder),
            leftJoin: jest.fn(() => builder),
            where: jest.fn((_sql: string, params: { id: string }) => {
              targetId = params.id;
              return builder;
            }),
            andWhere: jest.fn(() => builder),
            getOne: jest.fn(async () => {
              if (!targetId) return null;
              const row = rows.get(targetId);
              if (!row || !passesApplicationVisibilityFilter(row)) return null;
              return { ...row, journey: { userId: ownerId } };
            }),
          };
          return builder;
        }),
      };
      service = new TasksService(
        tasks,
        {} as any,
        {} as any,
        {} as any,
        configServiceMock,
      );
    });

    it('a task with no Application (journey-level) remains retrievable', async () => {
      const task = await service.findOwnedOrThrow('task-no-app', ownerId);
      expect(task.id).toBe('task-no-app');
    });

    it('a task whose Application is still active remains retrievable', async () => {
      const task = await service.findOwnedOrThrow('task-active-app', ownerId);
      expect(task.id).toBe('task-active-app');
    });

    it('a task whose Application is soft-deleted 404s — not normally retrievable', async () => {
      await expect(
        service.findOwnedOrThrow('task-deleted-app', ownerId),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('findAllForUser (list)', () => {
    let tasks: any;
    let service: TasksService;

    beforeEach(() => {
      const rows = makeRows();
      const qb: any = {
        innerJoin: jest.fn(() => qb),
        leftJoin: jest.fn(() => qb),
        andWhere: jest.fn(() => qb),
        orderBy: jest.fn(() => qb),
        addOrderBy: jest.fn(() => qb),
        take: jest.fn(() => qb),
        getMany: jest.fn(async () =>
          rows
            .filter((r) => r.journeyUserId === ownerId)
            .filter(passesApplicationVisibilityFilter)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
        ),
      };
      tasks = { createQueryBuilder: jest.fn(() => qb) };
      service = new TasksService(
        tasks,
        {} as any,
        {} as any,
        {} as any,
        configServiceMock,
      );
    });

    it('excludes a task whose Application is soft-deleted from the list, even filtered only by journeyId', async () => {
      const result = await service.findAllForUser(
        ownerId,
        { journeyId: 'journey-1' },
        {},
      );
      expect(result.items.map((r: any) => r.id).sort()).toEqual([
        'task-active-app',
        'task-no-app',
      ]);
    });

    it('still includes journey-level and active-application tasks', async () => {
      const result = await service.findAllForUser(ownerId, {}, {});
      const ids = result.items.map((r: any) => r.id);
      expect(ids).toContain('task-no-app');
      expect(ids).toContain('task-active-app');
      expect(ids).not.toContain('task-deleted-app');
    });
  });
});
