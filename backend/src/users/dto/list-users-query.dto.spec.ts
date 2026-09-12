import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserRole } from '../../types';
import { ListUsersQueryDto } from './list-users-query.dto';
import { SHORT_TEXT_MAX_LENGTH } from '../../common/validators/text-limits';

describe('ListUsersQueryDto', () => {
  it('accepts search + role', async () => {
    const dto = plainToInstance(ListUsersQueryDto, {
      search: '  Ada  ',
      role: UserRole.ADMIN,
      limit: '10',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.search).toBe('Ada');
    expect(dto.role).toBe(UserRole.ADMIN);
    expect(dto.limit).toBe(10);
  });

  it('rejects oversized search', async () => {
    const dto = plainToInstance(ListUsersQueryDto, {
      search: 'x'.repeat(SHORT_TEXT_MAX_LENGTH + 1),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'search')).toBe(true);
  });

  it('rejects invalid role', async () => {
    const dto = plainToInstance(ListUsersQueryDto, { role: 'superadmin' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'role')).toBe(true);
  });
});
