import { NotFoundException } from '@nestjs/common';
import { UserRole } from '../types';
import { UsersService } from './users.service';

describe('UsersService — findAllForAdmin', () => {
  let usersRepository: any;
  let qb: any;
  let service: UsersService;

  beforeEach(() => {
    qb = {
      select: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      addOrderBy: jest.fn(() => qb),
      take: jest.fn(() => qb),
      getMany: jest.fn(async () => []),
    };
    usersRepository = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => qb),
    };
    service = new UsersService(
      usersRepository,
      { transaction: jest.fn() } as any,
      { get: () => ({ defaultPageSize: 25, maxPageSize: 100 }) } as any,
    );
  });

  it('selects only safe columns and maps directory items', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    qb.getMany.mockResolvedValueOnce([
      {
        id: 'u1',
        email: 'a@example.invalid',
        name: 'Ada',
        role: UserRole.USER,
        isVerified: true,
        createdAt,
        passwordHash: 'should-not-appear',
      },
    ]);

    const result = await service.findAllForAdmin({});
    expect(qb.select).toHaveBeenCalledWith([
      'user.id',
      'user.email',
      'user.name',
      'user.role',
      'user.isVerified',
      'user.createdAt',
    ]);
    expect(result.items).toEqual([
      {
        id: 'u1',
        email: 'a@example.invalid',
        name: 'Ada',
        role: UserRole.USER,
        isVerified: true,
        createdAt,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(JSON.stringify(result)).not.toContain('should-not-appear');
  });

  it('applies role filter and escaped search', async () => {
    await service.findAllForAdmin({
      role: UserRole.ADMIN,
      search: '100%',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('user.role = :role', {
      role: UserRole.ADMIN,
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      "(user.email ILIKE :search ESCAPE '\\' OR user.name ILIKE :search ESCAPE '\\')",
      { search: '%100\\%%' },
    );
  });

  it('ignores empty search after trim', async () => {
    await service.findAllForAdmin({ search: '   ' });
    expect(qb.andWhere).not.toHaveBeenCalledWith(
      expect.stringContaining('ILIKE'),
      expect.anything(),
    );
  });

  it('getRoleById returns null when missing', async () => {
    usersRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.getRoleById('missing')).resolves.toBeNull();
  });

  it('getByIdOrThrow 404s', async () => {
    usersRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.getByIdOrThrow('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
