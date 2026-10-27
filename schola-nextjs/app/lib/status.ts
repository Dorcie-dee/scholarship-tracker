import type { PillTone } from '@/components/ui/pill';

/**
 * One label + Pill tone per backend enum value, defined once so every page
 * renders the same status the same way (color and copy) instead of each
 * page inventing its own mapping. Enum values are mirrored from
 * `server/lib/enums.ts` — update both together if that file changes.
 */

interface StatusMeta {
  label: string;
  tone: PillTone;
}

function lookup<T extends Record<string, StatusMeta>>(map: T, key: string, fallback: StatusMeta): StatusMeta {
  return map[key] ?? fallback;
}

const APPLICATION_STATUS: Record<string, StatusMeta> = {
  not_started: { label: 'Not started', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'warning' },
  submitted: { label: 'Submitted', tone: 'primary' },
  under_review: { label: 'Under review', tone: 'primary' },
  interview: { label: 'Interview', tone: 'accent' },
  offer: { label: 'Offer', tone: 'success' },
  accepted: { label: 'Accepted', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
};
export function applicationStatusMeta(status: string): StatusMeta {
  return lookup(APPLICATION_STATUS, status, { label: status, tone: 'neutral' });
}

const REQUIREMENT_STATUS: Record<string, StatusMeta> = {
  unknown: { label: 'Not checked', tone: 'neutral' },
  confirmed: { label: 'Met', tone: 'success' },
  profile_match: { label: 'Met', tone: 'success' },
  ai_assessment: { label: 'In review', tone: 'warning' },
  needs_verification: { label: 'Needs verification', tone: 'warning' },
  not_met: { label: 'Missing', tone: 'danger' },
  not_applicable: { label: 'Not applicable', tone: 'neutral' },
  conditional: { label: 'Conditional', tone: 'accent' },
};
export function requirementStatusMeta(status: string): StatusMeta {
  return lookup(REQUIREMENT_STATUS, status, { label: status, tone: 'neutral' });
}
/** Requirement statuses that should count toward a "X of Y complete" progress figure. */
export const REQUIREMENT_MET_STATUSES = new Set(['confirmed', 'profile_match', 'conditional']);

const TASK_STATUS: Record<string, StatusMeta> = {
  todo: { label: 'To do', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'warning' },
  blocked: { label: 'Blocked', tone: 'danger' },
  done: { label: 'Done', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
export function taskStatusMeta(status: string): StatusMeta {
  return lookup(TASK_STATUS, status, { label: status, tone: 'neutral' });
}

const TASK_PRIORITY: Record<string, StatusMeta> = {
  low: { label: 'Low', tone: 'neutral' },
  medium: { label: 'Medium', tone: 'warning' },
  high: { label: 'High', tone: 'danger' },
  urgent: { label: 'Urgent', tone: 'danger' },
};
export function taskPriorityMeta(priority: string): StatusMeta {
  return lookup(TASK_PRIORITY, priority, { label: priority, tone: 'neutral' });
}

const DEADLINE_STATUS: Record<string, StatusMeta> = {
  upcoming: { label: 'Upcoming', tone: 'neutral' },
  due_soon: { label: 'Due soon', tone: 'warning' },
  passed: { label: 'Passed', tone: 'neutral' },
  met: { label: 'Complete', tone: 'success' },
  missed: { label: 'Missed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
export function deadlineStatusMeta(status: string): StatusMeta {
  return lookup(DEADLINE_STATUS, status, { label: status, tone: 'neutral' });
}

const STUDY_LEVEL_LABEL: Record<string, string> = {
  undergraduate: "Bachelor's",
  masters: "Master's",
  phd: 'PhD',
  postdoc: 'Postdoc',
  other: 'Other',
};
export function studyLevelLabel(level: string): string {
  return STUDY_LEVEL_LABEL[level] ?? level;
}

const OPPORTUNITY_TYPE_LABEL: Record<string, string> = {
  scholarship: 'Scholarship',
  grant: 'Grant',
  fellowship: 'Fellowship',
  funding: 'Funding',
  other: 'Other',
};
export function opportunityTypeLabel(type: string): string {
  return OPPORTUNITY_TYPE_LABEL[type] ?? type;
}

/** Formats an ISO date string as e.g. "15 Feb 2026" — the one date format used across the app. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "in 3 days" / "2 days ago" / "today" — for deadline urgency copy. */
export function relativeDays(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = date.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  const days = Math.round(diffMs / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}
