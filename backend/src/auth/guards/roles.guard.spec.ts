import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../../types';
import { RolesGuard } from './roles.guard';

/**
 * Track 1 Group B — RBAC foundation. Guards are plain classes with a
 * canActivate(context) method — genuinely unit-testable without booting
 * HTTP, by constructing a minimal fake ExecutionContext.
 *
 * Phase: admin directory — @Roles() paths re-read the live DB role.
 */
describe('RolesGuard', () => {
  let reflector: any;
  let usersService: { getRoleById: jest.Mock };
  let guard: RolesGuard;

  const makeContext = (
    user: { userId: string; role: UserRole } | undefined,
  ): ExecutionContext =>
    ({
      getHandler: () => ({}) as any,
      getClass: () => ({}) as any,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    usersService = {
      getRoleById: jest.fn(async (id: string) => {
        if (id === 'admin-1') return UserRole.ADMIN;
        if (id === 'user-1') return UserRole.USER;
        if (id === 'demoted-1') return UserRole.USER;
        return null;
      }),
    };
    guard = new RolesGuard(reflector, usersService as any);
  });

  it('allows the request through when no @Roles() metadata is present — without a DB lookup', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = makeContext({ userId: 'user-1', role: UserRole.USER });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(usersService.getRoleById).not.toHaveBeenCalled();
  });

  it('allows the request through when @Roles() metadata is an empty array — without a DB lookup', async () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    const context = makeContext({ userId: 'user-1', role: UserRole.USER });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(usersService.getRoleById).not.toHaveBeenCalled();
  });

  it('allows an ADMIN through a route requiring ADMIN after live DB role check', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = makeContext({ userId: 'admin-1', role: UserRole.ADMIN });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(usersService.getRoleById).toHaveBeenCalledWith('admin-1');
  });

  it('rejects a USER on a route requiring ADMIN, with ForbiddenException (403, not 401)', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = makeContext({ userId: 'user-1', role: UserRole.USER });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects a demoted admin whose JWT claim is still ADMIN but DB role is USER', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = makeContext({
      userId: 'demoted-1',
      role: UserRole.ADMIN, // stale JWT claim
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(usersService.getRoleById).toHaveBeenCalledWith('demoted-1');
  });

  it('rejects when @Roles() is present but request.user is missing', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = makeContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(usersService.getRoleById).not.toHaveBeenCalled();
  });

  it('reads metadata from both the handler AND the class', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = makeContext({ userId: 'admin-1', role: UserRole.ADMIN });

    await guard.canActivate(context);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
  });
});
