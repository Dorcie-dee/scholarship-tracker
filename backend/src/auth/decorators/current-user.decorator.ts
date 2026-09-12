import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserRole } from '../../types';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  /**
   * Taken from the access token's claims at issuance time — can lag reality
   * by up to the access token's lifetime (15m default) if verification status
   * changes mid-token. Acceptable staleness, same as any other JWT claim; see
   * user.entity.ts's `isVerified` doc comment for why this isn't currently
   * enforced as an access gate anywhere.
   */
  isVerified: boolean;
  /**
   * Same claim shape as other JWT fields — may lag a DB role change until the
   * access token expires. Routes protected by `@Roles()` re-check the live
   * role via RolesGuard + UsersService.getRoleById(), so admin demotion takes
   * effect immediately on those routes regardless of this claim.
   */
  role: UserRole;
}

/**
 * Pulls the authenticated user off the request (attached by JwtStrategy's
 * `validate()`). Only meaningful behind JwtAuthGuard — using it on a @Public()
 * route will yield `undefined`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
