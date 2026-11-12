/**
 * Admin-page-local API shapes. Mirrors the backend models' `toJSON()`
 * output (see `server/lib/schema-utils.ts` — `_id` is always rewritten to a
 * plain string `id`). Kept local to this page's components rather than
 * added to the shared `app/lib/*` (off-limits — see this page's build
 * notes) or imported from `server/lib/enums.ts` (frontend code
 * intentionally never imports from `server/`).
 */

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  role: 'user' | 'admin';
  isVerified: boolean;
  createdAt: string;
}

export interface AdminUserDirectoryPage {
  items: AdminUser[];
  nextCursor: string | null;
  hasNextPage: boolean;
}
