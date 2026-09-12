import { JourneysService } from './journeys.service';

/**
 * Covers the Promise.all parallelization in create()/update(): the (optional)
 * university existence check and the (optional) programme existence check
 * run concurrently, and both must still be enforced correctly.
 */
describe('JourneysService — parallelized validation checks', () => {
  const userId = 'user-1';

  let journeys: any;
  let universitiesService: any;
  let programmesService: any;
  let service: JourneysService;

  beforeEach(() => {
    let nextId = 1;
    journeys = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => ({
        id: row.id ?? `journey-${nextId++}`,
        ...row,
      })),
      findOne: jest.fn(async () => ({ id: 'journey-1', userId })),
    };
    universitiesService = {
      findOneOrThrow: jest.fn(async (id: string) => ({ id })),
    };
    programmesService = {
      findOneOrThrow: jest.fn(async (id: string) => ({ id })),
    };

    service = new JourneysService(
      journeys,
      universitiesService,
      programmesService,
      {
        get: jest.fn(() => ({ defaultPageSize: 25, maxPageSize: 100 })),
      } as any,
    );
  });

  it('create() validates both university and programme existence when both are provided', async () => {
    await service.create(userId, {
      title: 'MSc Computer Science — University of Twente',
      universityId: 'university-1',
      programmeId: 'programme-1',
    });

    expect(universitiesService.findOneOrThrow).toHaveBeenCalledWith(
      'university-1',
    );
    expect(programmesService.findOneOrThrow).toHaveBeenCalledWith(
      'programme-1',
    );
  });

  it('create() still rejects when the university does not exist', async () => {
    universitiesService.findOneOrThrow.mockRejectedValueOnce(
      new Error('university not found'),
    );

    await expect(
      service.create(userId, {
        title: 'MSc Computer Science',
        universityId: 'missing-university',
        programmeId: 'programme-1',
      } as any),
    ).rejects.toThrow('university not found');
  });

  it('create() still rejects when the programme does not exist', async () => {
    programmesService.findOneOrThrow.mockRejectedValueOnce(
      new Error('programme not found'),
    );

    await expect(
      service.create(userId, {
        title: 'MSc Computer Science',
        universityId: 'university-1',
        programmeId: 'missing-programme',
      } as any),
    ).rejects.toThrow('programme not found');
  });

  it('update() validates a changed universityId and a changed programmeId together', async () => {
    await service.update('journey-1', userId, {
      universityId: 'university-2',
      programmeId: 'programme-2',
    });

    expect(universitiesService.findOneOrThrow).toHaveBeenCalledWith(
      'university-2',
    );
    expect(programmesService.findOneOrThrow).toHaveBeenCalledWith(
      'programme-2',
    );
  });
});

/**
 * Track 1 Group E (E2) — ownership failures normalize to 404, uniformly with
 * "doesn't exist at all", closing a minor existence-disclosure inconsistency
 * (see common/utils/ownership.ts's doc comment). Uses the REAL
 * findOwnedOrThrow()/assertOwnership() path — not mocked away — since that's
 * exactly the behavior under test here.
 */
describe('JourneysService — ownership normalizes to 404 (Track 1 Group E)', () => {
  const ownerId = 'user-1';
  const otherUserId = 'user-2';

  let journeys: any;
  let service: JourneysService;

  beforeEach(() => {
    const rows = new Map<string, any>([
      ['journey-owned', { id: 'journey-owned', userId: ownerId }],
      ['journey-foreign', { id: 'journey-foreign', userId: otherUserId }],
    ]);
    journeys = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => row),
      findOne: jest.fn(async ({ where: { id } }: any) => rows.get(id) ?? null),
      delete: jest.fn(async (id: string) => {
        rows.delete(id);
      }),
    };
    service = new JourneysService(journeys, {} as any, {} as any, {} as any);
  });

  it('a foreign-owned journey 404s, not 403s', async () => {
    await expect(
      service.findOwnedOrThrow('journey-foreign', ownerId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('a nonexistent journey also 404s, identically', async () => {
    await expect(
      service.findOwnedOrThrow('journey-does-not-exist', ownerId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('the legitimate owner can still access their own journey', async () => {
    const journey = await service.findOwnedOrThrow('journey-owned', ownerId);
    expect(journey.id).toBe('journey-owned');
  });

  it('update() on a foreign-owned journey 404s and writes nothing', async () => {
    await expect(
      service.update('journey-foreign', ownerId, { title: 'Hijacked' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(journeys.save).not.toHaveBeenCalled();
  });

  it('remove() on a foreign-owned journey 404s and deletes nothing', async () => {
    await expect(
      service.remove('journey-foreign', ownerId),
    ).rejects.toMatchObject({ status: 404 });
    expect(journeys.delete).not.toHaveBeenCalled();
  });
});

/** Production hardening (Batch 4) — findAllForUser() is keyset-paginated and stays userId-scoped. */
describe('JourneysService — findAllForUser pagination (Batch 4)', () => {
  const ownerId = 'user-1';
  let journeys: any;
  let service: JourneysService;

  beforeEach(() => {
    const rows = [
      {
        id: 'j-1',
        userId: ownerId,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'j-2',
        userId: ownerId,
        createdAt: new Date('2026-02-01T00:00:00Z'),
      },
      {
        id: 'j-3',
        userId: 'user-2',
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
    ];
    const qb: any = {
      andWhere: jest.fn((sql: string, params: any) => {
        qb.__where = { ...(qb.__where ?? {}), ...params, __sql: sql };
        return qb;
      }),
      orderBy: jest.fn(() => qb),
      addOrderBy: jest.fn(() => qb),
      take: jest.fn(() => qb),
      getMany: jest.fn(async () =>
        rows
          .filter((r) => r.userId === qb.__where.userId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      ),
    };
    journeys = { createQueryBuilder: jest.fn(() => qb) };
    service = new JourneysService(
      journeys,
      {} as any,
      {} as any,
      {
        get: jest.fn(() => ({ defaultPageSize: 25, maxPageSize: 100 })),
      } as any,
    );
  });

  it("only returns journeys belonging to the requesting user, never another user's", async () => {
    const result = await service.findAllForUser(ownerId, {});
    expect(result.items.map((r: any) => r.id).sort()).toEqual(['j-1', 'j-2']);
  });
});
