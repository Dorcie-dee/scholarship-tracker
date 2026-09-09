import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { UserRole } from '../types';
import { UsersService, normalizeEmail } from './users.service';

/**
 * Covers duplicate-email handling in createUser(): the common case (upfront
 * check finds an existing row) and the race-condition case (two requests pass
 * the check before either commits, so the database's unique index rejects the
 * second insert) both must surface as the same clean ConflictException — not
 * a raw, unhandled database error.
 */
describe('UsersService — duplicate email handling', () => {
  let usersRepository: any;
  let service: UsersService;

  beforeEach(() => {
    usersRepository = {
      findOne: jest.fn(async () => null),
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => ({ id: 'user-1', ...row })),
      createQueryBuilder: jest.fn(),
    };
    service = new UsersService(usersRepository);
  });

  const params = {
    email: 'person@example.invalid',
    passwordHash: 'hashed',
    name: 'Person',
  };

  it('throws ConflictException via the upfront check when the email already exists', async () => {
    usersRepository.findOne.mockResolvedValueOnce({ id: 'existing-user' });

    await expect(service.createUser(params)).rejects.toThrow(ConflictException);
    expect(usersRepository.save).not.toHaveBeenCalled();
  });

  it('translates a unique-violation error from save() into ConflictException (race condition)', async () => {
    // Simulates two concurrent registrations for the same email: the upfront
    // check (findOne) sees no existing row for either, but the database's
    // unique index rejects the second insert.
    const driverError = Object.assign(
      new Error('duplicate key value violates unique constraint'),
      {
        code: '23505',
      },
    );
    usersRepository.save.mockRejectedValueOnce(
      new QueryFailedError('INSERT INTO "users" ...', undefined, driverError),
    );

    await expect(service.createUser(params)).rejects.toThrow(ConflictException);
  });

  it('does not swallow a database error that is not a unique violation', async () => {
    const driverError = Object.assign(new Error('connection terminated'), {
      code: '57P01', // admin_shutdown — an unrelated Postgres error code
    });
    const notAUniqueViolation = new QueryFailedError(
      'INSERT INTO "users" ...',
      undefined,
      driverError,
    );
    usersRepository.save.mockRejectedValueOnce(notAUniqueViolation);

    await expect(service.createUser(params)).rejects.toThrow(
      notAUniqueViolation,
    );
  });

  it('does not swallow a plain (non-QueryFailedError) error either', async () => {
    const genericError = new Error('some other failure');
    usersRepository.save.mockRejectedValueOnce(genericError);

    await expect(service.createUser(params)).rejects.toThrow(genericError);
  });
});

/**
 * Track 1 / A1.2 — the bug this covers: findByEmail() used to query with
 * whatever casing the caller passed in, while createUser() always stored a
 * lowercased value — so a user who registered as "Jane@Example.com" could
 * not log in typing that same casing back (the case-sensitive unique index
 * on `email` never matched). Fixed by normalizing inside findByEmail() so
 * every caller benefits, not just the DTO boundary.
 */
describe('UsersService — email normalization', () => {
  it('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  Jane@Example.com  ')).toBe('jane@example.com');
    expect(normalizeEmail('ALREADY@LOWER.INVALID'.toLowerCase())).toBe(
      'already@lower.invalid',
    );
  });

  let usersRepository: any;
  let service: UsersService;

  beforeEach(() => {
    usersRepository = {
      findOne: jest.fn(async () => null),
      createQueryBuilder: jest.fn(),
    };
    service = new UsersService(usersRepository);
  });

  it('findByEmail queries with a normalized value regardless of input casing', async () => {
    await service.findByEmail('Jane@Example.com');
    expect(usersRepository.findOne).toHaveBeenCalledWith({
      where: { email: 'jane@example.com' },
    });
  });

  it('findByEmail(withPasswordHash) also normalizes before building the query', async () => {
    const addSelect = jest.fn().mockReturnThis();
    const where = jest.fn().mockReturnThis();
    const getOne = jest.fn(async () => null);
    usersRepository.createQueryBuilder.mockReturnValue({
      addSelect,
      where,
      getOne,
    });

    await service.findByEmail('  Jane@Example.com  ', true);

    expect(where).toHaveBeenCalledWith('user.email = :email', {
      email: 'jane@example.com',
    });
  });

  it('a mixed-case registered email can be found by any casing of the same address', async () => {
    // Simulates the real invariant: createUser() always stores lowercased
    // (see the test below), so a lookup with different casing for the SAME
    // logical account must resolve to the SAME stored row.
    usersRepository.findOne.mockImplementation(async ({ where }: any) =>
      where.email === 'jane@example.com'
        ? { id: 'user-1', email: 'jane@example.com' }
        : null,
    );

    const viaOriginalCasing = await service.findByEmail('Jane@Example.com');
    const viaAllCaps = await service.findByEmail('JANE@EXAMPLE.COM');
    const viaLower = await service.findByEmail('jane@example.com');

    expect(viaOriginalCasing?.id).toBe('user-1');
    expect(viaAllCaps?.id).toBe('user-1');
    expect(viaLower?.id).toBe('user-1');
  });
});

describe('UsersService — update/markVerified (A1.3)', () => {
  let usersRepository: any;
  let service: UsersService;

  beforeEach(() => {
    usersRepository = {
      update: jest.fn(async () => ({ affected: 1 })),
      findOne: jest.fn(async () => ({ id: 'user-1', name: 'New name' })),
    };
    service = new UsersService(usersRepository);
  });

  it('update() issues one UPDATE then re-reads the user — same query shape as the controller had before A1.3', async () => {
    const result = await service.update('user-1', { name: 'New name' });

    expect(usersRepository.update).toHaveBeenCalledWith('user-1', {
      name: 'New name',
    });
    expect(usersRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'user-1' },
    });
    expect(result.name).toBe('New name');
  });

  it('markVerified() sets isVerified without touching other fields', async () => {
    await service.markVerified('user-1');
    expect(usersRepository.update).toHaveBeenCalledWith('user-1', {
      isVerified: true,
    });
  });

  /**
   * Track 1 Group B — RBAC privilege-escalation coverage. Per the explicit
   * instruction: "Do not assume the role is safe merely because the DTO
   * doesn't contain it. Verify the persistence layer and service update
   * behaviour as well." — this proves the SERVICE itself refuses to write
   * `role`, independent of whatever the DTO's shape happens to allow at any
   * given time.
   */
  it('update() cannot set role, even if a caller passes one at runtime bypassing the DTO type', async () => {
    // `as any` deliberately simulates a caller (or a future, less-careful
    // change) bypassing UpdateUserDto's compile-time shape — the real
    // safety boundary this test proves is the explicit allowlist inside
    // UsersService.update() itself, not TypeScript's type checker.
    await service.update('user-1', {
      name: 'New name',
      role: UserRole.ADMIN,
    } as any);

    expect(usersRepository.update).toHaveBeenCalledWith('user-1', {
      name: 'New name',
    });
    expect(usersRepository.update).not.toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ role: expect.anything() }),
    );
  });

  it('update() with no name field writes nothing (does not accidentally null out unrelated columns)', async () => {
    await service.update('user-1', {});
    expect(usersRepository.update).toHaveBeenCalledWith('user-1', {});
  });
});

describe('UsersService — createUser always assigns the least-privileged role', () => {
  let usersRepository: any;
  let service: UsersService;

  beforeEach(() => {
    usersRepository = {
      findOne: jest.fn(async () => null),
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => ({ id: 'user-1', ...row })),
    };
    service = new UsersService(usersRepository);
  });

  it('createUser() sets role: USER explicitly, regardless of anything the caller attempts to pass', async () => {
    // createUser()'s params type has no `role` field at all — TypeScript
    // itself refuses to compile a caller trying to supply one. `as any`
    // simulates a caller bypassing that (the same defense-in-depth
    // reasoning as the update() test above).
    await service.createUser({
      email: 'person@example.invalid',
      passwordHash: 'hashed',
      role: UserRole.ADMIN,
    } as any);

    expect(usersRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.USER }),
    );
  });
});
