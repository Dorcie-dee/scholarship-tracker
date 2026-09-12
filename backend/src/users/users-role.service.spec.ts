import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../types';
import { UsersService } from './users.service';

describe('UsersService — updateRole (admin promotion/demotion)', () => {
  let usersRepository: any;
  let service: UsersService;

  beforeEach(() => {
    usersRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (row: any) => row),
      count: jest.fn(async () => 2),
    };
    const dataSource = {
      transaction: jest.fn(async (fn: any) =>
        fn({ getRepository: () => usersRepository }),
      ),
    };
    service = new UsersService(
      usersRepository,
      dataSource as any,
      { get: () => ({ defaultPageSize: 25, maxPageSize: 100 }) } as any,
    );
  });

  it('forbids changing your own role', async () => {
    await expect(
      service.updateRole('admin-1', 'admin-1', { role: UserRole.USER }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('promotes another user to ADMIN', async () => {
    usersRepository.findOne.mockResolvedValueOnce({
      id: 'user-2',
      role: UserRole.USER,
    });
    const result = await service.updateRole('admin-1', 'user-2', {
      role: UserRole.ADMIN,
    });
    expect(result.role).toBe(UserRole.ADMIN);
    expect(usersRepository.save).toHaveBeenCalled();
  });

  it('refuses to demote the last remaining ADMIN', async () => {
    usersRepository.findOne.mockResolvedValueOnce({
      id: 'admin-2',
      role: UserRole.ADMIN,
    });
    usersRepository.count.mockResolvedValueOnce(1);
    await expect(
      service.updateRole('admin-1', 'admin-2', { role: UserRole.USER }),
    ).rejects.toThrow(BadRequestException);
  });

  it('404s when the target user does not exist', async () => {
    usersRepository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.updateRole('admin-1', 'missing', { role: UserRole.ADMIN }),
    ).rejects.toThrow(NotFoundException);
  });
});
