'use client';

/**
 * Shared React Query hooks + types for the Dashboard and "My applications"
 * pages. New file (not part of the protected `app/lib/*` foundation) so
 * those shared files stay untouched — see the two pages' doc comments for
 * why the data is composed this way.
 *
 * There is no single dashboard-aggregation endpoint, so this module fans
 * out a handful of list calls per page load:
 *  - Journeys/Applications/Tasks each support listing ALL of the caller's
 *    own rows in one call (no required scoping filter), so those are one
 *    `useQuery` each.
 *  - Requirements and Deadlines both REQUIRE a filter (there's no
 *    `journeyId`/"all mine" filter on either), so progress-per-application
 *    and deadlines-per-application are fetched with `useQueries` — one
 *    request per application, run in parallel, not a sequential waterfall.
 *  - Opportunities are looked up the same way, one per distinct
 *    `opportunityId` referenced by the caller's applications.
 * This is pragmatic for the realistic case (a handful of journeys/
 * applications per student), not a general solution for hundreds of rows.
 */

import { useQueries, useQuery } from '@tanstack/react-query';
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

export function useApplicationRequirements(applicationIds: string[]) {
  return useQueries({
    queries: applicationIds.map((id) => ({
      queryKey: ['requirements', id],
      queryFn: () => apiFetch<PaginatedResult<Requirement>>(`/requirements?applicationId=${id}&limit=${LIST_LIMIT}`),
    })),
  });
}

export function useApplicationDeadlines(applicationIds: string[]) {
  return useQueries({
    queries: applicationIds.map((id) => ({
      queryKey: ['deadlines', 'application', id],
      queryFn: () => apiFetch<PaginatedResult<Deadline>>(`/deadlines?applicationId=${id}&limit=${LIST_LIMIT}`),
    })),
  });
}

export function useOpportunities(opportunityIds: string[]) {
  return useQueries({
    queries: opportunityIds.map((id) => ({
      queryKey: ['opportunity', id],
      queryFn: () => apiFetch<Opportunity>(`/opportunities/${id}`),
    })),
  });
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
