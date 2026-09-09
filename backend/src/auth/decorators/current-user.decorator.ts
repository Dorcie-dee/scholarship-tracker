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
   * Same staleness class as `isVerified` above — a role change takes up to
   * the access token's lifetime (15m default) to reflect in an
   * already-issued token. No role-management endpoint exists in this V1
   * foundation (role changes happen via direct DB access — see
   * docs/decisions.md), so this window is not yet exercised in practice;
   * documented now so it's not a surprise if/when one is added.
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
