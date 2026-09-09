import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Registered globally as a THIRD APP_GUARD, alongside JwtAuthGuard and
 * ThrottlerGuard (see app.module.ts) — not a competing/parallel
 * authorization system, the same enhancer pattern extended once more.
 * MUST be registered after JwtAuthGuard in the providers array: it reads
 * `request.user`, which only JwtAuthGuard's underlying JwtStrategy populates
 * (confirmed global-guard execution follows providers-array order — see
 * node_modules/@nestjs/core/application-config.js's addGlobalGuard, a plain
 * array push, and guards-context-creator.js, which returns it as-is).
 *
 * No @Roles() on a route/controller = no restriction (returns true
 * immediately) — same opt-in-to-restriction shape as @Public() is
 * opt-out-of-authentication, so most routes are entirely unaffected by this
 * guard's existence.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      UserRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    // Defensive only — JwtAuthGuard already ran first and would have
    // rejected an unauthenticated request with 401 before this guard is
    // ever reached on a non-@Public() route.
    if (!user) {
      throw new ForbiddenException('Insufficient role for this resource');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient role for this resource');
    }

    return true;
  }
}
