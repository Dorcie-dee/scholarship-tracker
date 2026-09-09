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
