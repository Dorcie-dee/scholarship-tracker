import type { PillTone } from '@/components/ui/pill';

/**
 * Discover-page-local API shapes + small lookup tables. Mirrors the backend
 * models' `toJSON()` output (see `server/lib/schema-utils.ts` — `_id` is
 * always rewritten to a plain string `id`). Kept local to this page's
 * components rather than added to the shared `app/lib/*` (off-limits —
 * see this page's build notes) or imported from `server/lib/enums.ts`
 * (frontend code intentionally never imports from `server/`, same
 * convention `app/lib/status.ts` already follows for its own label maps).
 */

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasNextPage: boolean;
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
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface University {
  id: string;
  name: string;
  country: string | null;
  website: string | null;
  notes: string | null;
}

export interface Journey {
  id: string;
  userId: string;
  title: string;
  goal: string | null;
  status: string;
  universityId: string | null;
  programmeId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Application {
  id: string;
  journeyId: string;
  title: string;
  applicationType: string;
  status: string;
  opportunityId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Mirrors `OpportunityType` in `server/lib/enums.ts` — keep both in sync. */
export const OPPORTUNITY_TYPE_VALUES = ['scholarship', 'grant', 'fellowship', 'funding', 'other'] as const;

/** Mirrors `StudyLevel` in `server/lib/enums.ts` — keep both in sync. */
export const STUDY_LEVEL_VALUES = ['undergraduate', 'masters', 'phd', 'postdoc', 'other'] as const;

const OPPORTUNITY_TYPE_TONE: Record<string, PillTone> = {
  scholarship: 'primary',
  grant: 'accent',
  fellowship: 'success',
  funding: 'warning',
  other: 'neutral',
};

/** Pill tone for an opportunity-type badge — a visual-only mapping, independent of `opportunityTypeLabel()`'s copy. */
export function opportunityTypeTone(type: string): PillTone {
  return OPPORTUNITY_TYPE_TONE[type] ?? 'neutral';
}
