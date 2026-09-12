import { ConflictException, NotFoundException } from '@nestjs/common';
import { ApplicationsService } from './applications.service';

describe('ApplicationsService — restore', () => {
  let applications: any;
  let journeysService: any;
  let opportunitiesService: any;
  let requirements: any;
  let configService: any;
  let service: ApplicationsService;

  beforeEach(() => {
    applications = {
      findOne: jest.fn(),
      softDelete: jest.fn(),
      recover: jest.fn(async (row: any) => {
        row.deletedAt = null;
        return row;
      }),
      createQueryBuilder: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      manager: { transaction: jest.fn() },
    };
    journeysService = { findOwnedOrThrow: jest.fn() };
    opportunitiesService = { findOneOrThrow: jest.fn() };
    requirements = { find: jest.fn(), create: jest.fn(), save: jest.fn() };
    configService = {
      get: jest.fn(() => ({ defaultPageSize: 25, maxPageSize: 100 })),
    };
    service = new ApplicationsService(
      applications,
      requirements,
      journeysService,
      opportunitiesService,
      configService,
    );
  });

  it('restores a soft-deleted owned application', async () => {
    const deleted = {
      id: 'app-1',
      deletedAt: new Date(),
      journey: { userId: 'user-1' },
    };
    applications.findOne.mockResolvedValueOnce(deleted).mockResolvedValueOnce({
      id: 'app-1',
      deletedAt: null,
      journey: { userId: 'user-1' },
    });

    const result = await service.restore('app-1', 'user-1');
    expect(applications.recover).toHaveBeenCalled();
    expect(result.deletedAt).toBeNull();
  });

  it('404s for another user deleted application', async () => {
    applications.findOne.mockResolvedValueOnce({
      id: 'app-1',
      deletedAt: new Date(),
      journey: { userId: 'other' },
    });
    await expect(service.restore('app-1', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('409s when the application is not deleted', async () => {
    applications.findOne.mockResolvedValueOnce({
      id: 'app-1',
      deletedAt: null,
      journey: { userId: 'user-1' },
    });
    await expect(service.restore('app-1', 'user-1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('404s when the application was purged', async () => {
    applications.findOne.mockResolvedValueOnce(null);
    await expect(service.restore('app-1', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
