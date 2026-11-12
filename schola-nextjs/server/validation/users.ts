import { z } from 'zod';
import { UserRole } from '../lib/enums';
import { CURSOR_MAX_LENGTH, SHORT_TEXT_MAX_LENGTH } from '../lib/text-limits';

/**
 * Pagination query fields, defined locally rather than imported from
 * `server/validation/common.ts` — that module is owned/actively being
 * written by another concurrent agent porting other modules and its
 * exports were still changing shape as of this port; keeping this module
 * self-contained (depending only on the frozen `server/lib/*` foundation)
 * avoids a cross-module coupling hazard. Matches the shape
 * `server/lib/pagination.ts#paginate()` accepts.
 */
const cursorField = z.string().max(CURSOR_MAX_LENGTH).optional();
const limitField = z.coerce.number().int().min(1).optional();
const orderField = z.enum(['asc', 'desc']).optional();

/**
 * Ported from the original NestJS backend's `UpdateUserDto`. Deliberately
 * only `name` — `.strict()` rejects any other field (including `role`)
 * outright with a 400, the zod equivalent of the original global
 * `ValidationPipe({ forbidNonWhitelisted: true })`. See
 * `server/services/users.service.ts`'s `updateMe()` for the second,
 * defense-in-depth allowlist at the service layer.
 */
export const updateUserSchema = z
  .object({
    name: z.string().max(255).optional(),
  })
  .strict();

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** Ported from the original NestJS backend's `UpdateUserRoleDto`. ADMIN-only; never accepted on `PATCH /users/me`. */
export const updateUserRoleSchema = z
  .object({
    role: z.nativeEnum(UserRole),
  })
  .strict();

export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;

/** Ported from the original NestJS backend's `ListUsersQueryDto`. ADMIN-only directory search/filter. */
export const listUsersQuerySchema = z
  .object({
    cursor: cursorField,
    limit: limitField,
    order: orderField,
    search: z.string().trim().max(SHORT_TEXT_MAX_LENGTH).optional(),
    role: z.nativeEnum(UserRole).optional(),
  })
  .strict();

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
