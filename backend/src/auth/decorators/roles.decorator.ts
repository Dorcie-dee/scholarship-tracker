import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../types';

export const ROLES_KEY = 'roles';

/**
 * Marks a route (or entire controller) as requiring one of the given roles.
 * Absence of this decorator means no role restriction — same non-invasive,
 * opt-IN-to-restriction pattern as @Public() opts OUT of authentication
 * (see public.decorator.ts). Read by RolesGuard, registered globally
 * alongside JwtAuthGuard — see app.module.ts.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
