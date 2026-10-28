'use client';

/**
 * Shared React Query hooks + types for the Dashboard and "My applications"
 * pages. New file (not part of the protected `app/lib/*` foundation) so
 * those shared files stay untouched.
 *
 * There is no single dashboard-aggregation endpoint, but every list here is
 * now a flat, constant-count set of calls regardless of how many
 * applications the caller has — no per-application fan-out:
 *  - Journeys/Applications/Tasks/Requirements/Deadlines each support
 *    listing ALL of the caller's own rows in one call (no required scoping
 *    filter — Requirements/Deadlines gained this "all mine" fallback
 *    specifically so this page could stop fanning out; see
 *    `server/services/requirements.service.ts#listRequirements` and
 *    `deadlines.service.ts#listDeadlines`), so those are one `useQuery` each.
 *  - Opportunities are resolved with a single bulk `?ids=a,b,c` lookup
 *    against every distinct `opportunityId` the caller's applications
 *    reference (`server/services/opportunities.service.ts#listOpportunities`),
 *    not one request per opportunity.
 * Total page-load cost is ~6 requests regardless of application count,
 * where it used to be `3 + 3N`.
 */

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { REQUIREMENT_MET_STATUSES } from '@/lib/status';

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
  startDate: string | null;
  submissionDate: string | null;
  portal: string | null;
  externalUrl: string | null;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  completedAt: string | null;
  applicationId: string | null;
  journeyId: string;
  requirementId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Deadline {
  id: string;
  label: string;
  deadlineType: string;
  date: string;
  status: string;
  opportunityId: string | null;
  applicationId: string | null;
  taskId: string | null;
  requirementId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Requirement {
  id: string;
  requirementType: string;
  description: string;
  status: string;
  opportunityId: string | null;
  applicationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Opportunity {
  id: string;
  title: string;
  provider: string | null;
  opportunityType: string;
  country: string | null;
  studyLevel: string | null;
  field: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

/**
 * The backend caps pages at `PAGINATION_MAX_PAGE_SIZE` (100 by default).
 * Requesting that ceiling in one call — rather than building out full
 * cursor-pagination UI — is a deliberate simplification for a student's
 * realistic handful of journeys/applications/tasks; see this module's doc
 * comment and the final report for the trade-off this makes.
 */
const LIST_LIMIT = 100;

export function useJourneys() {
  return useQuery({
    queryKey: ['journeys'],
    queryFn: () => apiFetch<PaginatedResult<Journey>>(`/journeys?limit=${LIST_LIMIT}`),
  });
}

export function useApplications() {
  return useQuery({
    queryKey: ['applications'],
    queryFn: () => apiFetch<PaginatedResult<Application>>(`/applications?limit=${LIST_LIMIT}`),
  });
}

/** No `journeyId` filter -> every Task across every one of the caller's Journeys, in one call. */
export function useAllTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiFetch<PaginatedResult<Task>>(`/tasks?limit=${LIST_LIMIT}`),
  });
}

/** No `applicationId`/`opportunityId` filter -> every Requirement across every one of the caller's own applications, in one call. */
export function useAllRequirements() {
  return useQuery({
    queryKey: ['requirements'],
    queryFn: () => apiFetch<PaginatedResult<Requirement>>(`/requirements?limit=${LIST_LIMIT}`),
  });
}

/** No filter -> every Deadline reachable via an application/task/requirement the caller owns, in one call. */
export function useAllDeadlines() {
  return useQuery({
    queryKey: ['deadlines'],
    queryFn: () => apiFetch<PaginatedResult<Deadline>>(`/deadlines?limit=${LIST_LIMIT}`),
  });
}

/** One bulk lookup for every distinct opportunityId, instead of one request per opportunity. */
export function useOpportunitiesByIds(opportunityIds: string[]) {
  return useQuery({
    queryKey: ['opportunities', 'byIds', ...[...opportunityIds].sort()],
    queryFn: () =>
      apiFetch<PaginatedResult<Opportunity>>(
        `/opportunities?ids=${opportunityIds.join(',')}&limit=${LIST_LIMIT}`,
      ),
    enabled: opportunityIds.length > 0,
  });
}

/** Groups a flat list by its `applicationId` (or `opportunityId`/`id`) field — the client-side counterpart to the backend's flat "all mine" lists. */
export function groupBy<T>(items: T[], key: (item: T) => string | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    const existing = map.get(k);
    if (existing) existing.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export interface RequirementProgress {
  met: number;
  total: number;
  percent: number;
}

export function requirementProgress(requirements: Requirement[] | undefined): RequirementProgress {
  if (!requirements || requirements.length === 0) return { met: 0, total: 0, percent: 0 };
  const met = requirements.filter((r) => REQUIREMENT_MET_STATUSES.has(r.status)).length;
  return { met, total: requirements.length, percent: Math.round((met / requirements.length) * 100) };
}

export function isTaskOpen(status: string): boolean {
  return status !== 'done' && status !== 'cancelled';
}

export function isDeadlineUpcoming(status: string): boolean {
  return status === 'upcoming' || status === 'due_soon';
}

/** The nearest not-yet-resolved deadline in a list, or null if there isn't one. */
export function soonestUpcomingDeadline(deadlines: Deadline[] | undefined): Deadline | null {
  if (!deadlines || deadlines.length === 0) return null;
  const upcoming = deadlines.filter((d) => isDeadlineUpcoming(d.status));
  if (upcoming.length === 0) return null;
  return upcoming.reduce((soonest, d) => (new Date(d.date) < new Date(soonest.date) ? d : soonest));
}
