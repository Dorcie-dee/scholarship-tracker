import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../../types';
import { RolesGuard } from './roles.guard';

/**
 * Track 1 Group B — RBAC foundation. Guards are plain classes with a
 * canActivate(context) method — genuinely unit-testable without booting
 * HTTP, by constructing a minimal fake ExecutionContext, same principle
 * already used for the Reflector-metadata tests in
 * auth.controller.throttle.spec.ts/app.module.guards.spec.ts.
 */
describe('RolesGuard', () => {
  let reflector: any;
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
    guard = new RolesGuard(reflector);
  });

  it('allows the request through when no @Roles() metadata is present at all', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = makeContext({ userId: 'user-1', role: UserRole.USER });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows the request through when @Roles() metadata is an empty array', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    const context = makeContext({ userId: 'user-1', role: UserRole.USER });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows an ADMIN through a route requiring ADMIN', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = makeContext({ userId: 'admin-1', role: UserRole.ADMIN });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a USER on a route requiring ADMIN, with ForbiddenException (403, not 401 — the user IS authenticated)', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = makeContext({ userId: 'user-1', role: UserRole.USER });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects when @Roles() is present but request.user is missing (defensive — JwtAuthGuard should already have blocked this)', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = makeContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('reads metadata from both the handler AND the class, handler taking precedence (matches getAllAndOverride semantics)', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = makeContext({ userId: 'admin-1', role: UserRole.ADMIN });

    guard.canActivate(context);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
  });
});
