/**
 * Admin-page-local API shapes + small lookup tables. Mirrors the backend
 * models' `toJSON()` output (see `server/lib/schema-utils.ts` — `_id` is
 * always rewritten to a plain string `id`). Kept local to this page's
 * components rather than added to the shared `app/lib/*` (off-limits — see
 * this page's build notes) or imported from `server/lib/enums.ts` (frontend
 * code intentionally never imports from `server/`, same convention
 * `app/components/discover/types.ts` and `app/lib/status.ts` already follow
 * for their own shapes/label maps).
 */

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface University {
  id: string;
  name: string;
  country: string | null;
  website: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Programme {
  id: string;
  universityId: string;
  name: string;
  studyLevel: string | null;
  field: string | null;
  duration: string | null;
  website: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Opportunity {
  id: string;
  title: string;
  provider: string | null;
  opportunityType: string;
  country: string | null;
  fundingType: string | null;
  fundingAmount: string | null;
  currency: string | null;
  duration: string | null;
  studyLevel: string | null;
  field: string | null;
  eligibilitySummary: string | null;
  applicationMethod: string | null;
  applicationUrl: string | null;
  universityId: string | null;
  programmeId: string | null;
  createdAt: string;
  updatedAt: string;
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

/** Mirrors `StudyLevel` in `server/lib/enums.ts` — keep both in sync. */
export const STUDY_LEVEL_VALUES = ['undergraduate', 'masters', 'phd', 'postdoc', 'other'] as const;

/** Mirrors `OpportunityType` in `server/lib/enums.ts` — keep both in sync. */
export const OPPORTUNITY_TYPE_VALUES = ['scholarship', 'grant', 'fellowship', 'funding', 'other'] as const;
