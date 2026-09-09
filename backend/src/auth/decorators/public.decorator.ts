import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or entire controller) as not requiring authentication.
 * JwtAuthGuard is registered globally (see app.module.ts) — everything is
 * private by default, so routes must opt OUT explicitly rather than every
 * new module remembering to opt in.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
