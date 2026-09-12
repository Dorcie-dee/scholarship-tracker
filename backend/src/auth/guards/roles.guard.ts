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
import { UsersService } from '../../users/users.service';

/**
 * Registered globally as a THIRD APP_GUARD, alongside JwtAuthGuard and
 * ThrottlerGuard (see app.module.ts). MUST be registered after JwtAuthGuard:
 * it reads `request.user`, which only JwtAuthGuard's JwtStrategy populates.
 *
 * No @Roles() on a route/controller = no restriction and **no DB lookup** —
 * ordinary routes stay free of an extra query.
 *
 * When @Roles() is present, authorization uses the user's **current** role
 * from the database (not the possibly-stale JWT claim), so demotion takes
 * effect immediately for admin-only routes.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    const currentRole = await this.usersService.getRoleById(user.userId);
    if (!currentRole || !requiredRoles.includes(currentRole)) {
      throw new ForbiddenException('Insufficient role for this resource');
    }

    // Keep request.user.role aligned with the live value for downstream code.
    user.role = currentRole;

    return true;
  }
}
