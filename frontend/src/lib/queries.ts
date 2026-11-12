'use client';

/**
 * All TanStack Query hooks for the API. Organized to mirror docs/api-reference.md
 * section-for-section, so a missing/changed endpoint is easy to cross-check.
 *
 * Pagination: every list endpoint documented as keyset-paginated returns
 * `{ items, nextCursor, hasNextPage }` (never a bare array). Those use
 * `useInfiniteQuery` — `getNextPageParam` reads `nextCursor` straight off the
 * previous page, so the UI never constructs a cursor by hand. Because the
 * cursor lives in TanStack Query's own page-param chain (not component state)
 * and the query key includes every filter, changing a filter is a *new* query
 * key and therefore automatically starts back at an empty cursor — there is
 * no separate "reset cursor on filter change" bookkeeping to get wrong.
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, apiPostForm } from './api-client';
import type { SafeUser, UserRole } from './shared-types';
import type {
  AdminDirectoryUser,
  AppDocument,
  Application,
  ApplicationDocument,
  ApplicationJourney,
  ApplicationSnapshot,
  ApplicantProfile,
  Deadline,
  Opportunity,
  OpportunitySource,
  PaginatedResult,
  Programme,
  Requirement,
  SignedDownloadUrl,
  Task,
  University,
  UrlFetchPreview,
} from './types';

const PAGE_LIMIT = 20;

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&');
}

/** Shared shape for the useInfiniteQuery options every paginated list hook uses. */
function paginatedQuery<T>(basePath: string, filters: Record<string, string | undefined>) {
  return {
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      apiGet<PaginatedResult<T>>(
        `${basePath}${qs({ ...filters, cursor: pageParam, limit: String(PAGE_LIMIT) })}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: PaginatedResult<T>) =>
      lastPage.hasNextPage ? (lastPage.nextCursor ?? undefined) : undefined,
  };
}

/** Flattens the pages of a useInfiniteQuery<PaginatedResult<T>> into one items[] for rendering. */
export function flattenPages<T>(pages: PaginatedResult<T>[] | undefined): T[] {
  return pages?.flatMap((p) => p.items) ?? [];
}

// --- Auth (extras beyond login/register/logout/refresh, which live in auth-context.tsx) ---

export function useVerifyEmail() {
  return useMutation({
    mutationFn: (dto: { code: string }) => apiPost<void>('/auth/verify-email', dto),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: () => apiPost<void>('/auth/resend-verification'),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (dto: { email: string }) => apiPost<void>('/auth/forgot-password', dto),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (dto: { token: string; newPassword: string }) =>
      apiPost<void>('/auth/reset-password', dto),
  });
}

export function useLogoutAll() {
  return useMutation({
    mutationFn: () => apiPost<void>('/auth/logout-all'),
  });
}

export interface AuthSession {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  userAgent: string | null;
}

export function useSessions() {
  return useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => apiGet<AuthSession[]>('/auth/sessions'),
  });
}

// --- Users ------------------------------------------------------------------

export function useUpdateName() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { name: string }) => apiPatch<SafeUser>('/users/me', dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users', 'me'] }),
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => apiDelete<void>('/users/me'),
  });
}

// --- Profile (the "Master Profile") -----------------------------------------

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => apiGet<ApplicantProfile>('/profile'),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: Partial<ApplicantProfile>) => apiPatch<ApplicantProfile>('/profile', dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });
}

// --- Universities -------------------------------------------------------------

export function useUniversities(search?: string) {
  return useInfiniteQuery({
    queryKey: ['universities', { search }],
    ...paginatedQuery<University>('/universities', { search }),
  });
}

export function useUniversity(id: string) {
  return useQuery({
    queryKey: ['universities', id],
    queryFn: () => apiGet<University>(`/universities/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateUniversity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { name: string; country?: string; website?: string; notes?: string }) =>
      apiPost<University>('/universities', dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['universities'] }),
  });
}

export function useUpdateUniversity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Partial<University>) =>
      apiPatch<University>(`/universities/${id}`, dto),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['universities'] });
      queryClient.invalidateQueries({ queryKey: ['universities', id] });
    },
  });
}

export function useDeleteUniversity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/universities/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['universities'] }),
  });
}

// --- Programmes -----------------------------------------------------------

export function useProgrammes(universityId?: string) {
  return useInfiniteQuery({
    queryKey: ['programmes', { universityId }],
    ...paginatedQuery<Programme>('/programmes', { universityId }),
  });
}

export function useProgramme(id: string) {
  return useQuery({
    queryKey: ['programmes', id],
    queryFn: () => apiGet<Programme>(`/programmes/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateProgramme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: {
      universityId: string;
      name: string;
      studyLevel?: string;
      field?: string;
      notes?: string;
    }) => apiPost<Programme>('/programmes', dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['programmes'] }),
  });
}

export function useUpdateProgramme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Partial<Programme>) =>
      apiPatch<Programme>(`/programmes/${id}`, dto),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['programmes'] });
      queryClient.invalidateQueries({ queryKey: ['programmes', id] });
    },
  });
}

export function useDeleteProgramme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/programmes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['programmes'] }),
  });
}

// --- Opportunities ---------------------------------------------------------

export interface OpportunityFilters {
  studyLevel?: string;
  country?: string;
  opportunityType?: string;
  universityId?: string;
  programmeId?: string;
  [key: string]: string | undefined;
}

export function useOpportunities(filters: OpportunityFilters = {}) {
  return useInfiniteQuery({
    queryKey: ['opportunities', filters],
    ...paginatedQuery<Opportunity>('/opportunities', filters),
  });
}

export function useOpportunity(id: string) {
  return useQuery({
    queryKey: ['opportunities', id],
    queryFn: () => apiGet<Opportunity>(`/opportunities/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: Partial<Opportunity> & { title: string; opportunityType: string }) =>
      apiPost<Opportunity>('/opportunities', dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['opportunities'] }),
  });
}

export function useUpdateOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Partial<Opportunity>) =>
      apiPatch<Opportunity>(`/opportunities/${id}`, dto),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities', id] });
    },
  });
}

export function useDeleteOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/opportunities/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['opportunities'] }),
  });
}

// --- OpportunitySources (open CRUD, not ADMIN-gated) ------------------------

export function useOpportunitySources(opportunityId: string) {
  return useInfiniteQuery({
    queryKey: ['opportunity-sources', { opportunityId }],
    ...paginatedQuery<OpportunitySource>('/opportunity-sources', { opportunityId }),
    enabled: Boolean(opportunityId),
  });
}

export function useCreateOpportunitySource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      dto: Partial<OpportunitySource> & {
        opportunityId: string;
        sourceType?: string;
        autoFetch?: boolean;
      },
    ) => apiPost<OpportunitySource>('/opportunity-sources', dto),
    onSuccess: (_data, dto) => {
      queryClient.invalidateQueries({
        queryKey: ['opportunity-sources', { opportunityId: dto.opportunityId }],
      });
      queryClient.invalidateQueries({ queryKey: ['opportunities', dto.opportunityId] });
    },
  });
}

export function useFetchUrlPreview() {
  return useMutation({
    mutationFn: (url: string) =>
      apiPost<UrlFetchPreview>('/opportunity-sources/fetch-preview', { url }),
  });
}

export function useUpdateOpportunitySource(opportunityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Partial<OpportunitySource>) =>
      apiPatch<OpportunitySource>(`/opportunity-sources/${id}`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['opportunity-sources', { opportunityId }],
      });
      queryClient.invalidateQueries({ queryKey: ['opportunities', opportunityId] });
    },
  });
}

export function useDeleteOpportunitySource(opportunityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/opportunity-sources/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['opportunity-sources', { opportunityId }],
      });
      queryClient.invalidateQueries({ queryKey: ['opportunities', opportunityId] });
    },
  });
}

// --- Requirements ------------------------------------------------------------

export function useRequirements(filters: { opportunityId?: string; applicationId?: string }) {
  return useInfiniteQuery({
    queryKey: ['requirements', filters],
    ...paginatedQuery<Requirement>('/requirements', filters),
    enabled: Boolean(filters.opportunityId || filters.applicationId),
  });
}

export function useCreateRequirement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      dto: Partial<Requirement> & {
        requirementType: string;
        description: string;
        opportunityId?: string;
        applicationId?: string;
      },
    ) => apiPost<Requirement>('/requirements', dto),
    onSuccess: (_data, dto) => {
      if (dto.applicationId) {
        queryClient.invalidateQueries({
          queryKey: ['requirements', { applicationId: dto.applicationId }],
        });
      }
      if (dto.opportunityId) {
        queryClient.invalidateQueries({
          queryKey: ['requirements', { opportunityId: dto.opportunityId }],
        });
      }
    },
  });
}

export function useUpdateRequirement(invalidateKey: { opportunityId?: string; applicationId?: string }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Partial<Requirement>) =>
      apiPatch<Requirement>(`/requirements/${id}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['requirements', invalidateKey] }),
  });
}

export function useDeleteRequirement(invalidateKey: { opportunityId?: string; applicationId?: string }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/requirements/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['requirements', invalidateKey] }),
  });
}

/** AI suggests only — never mutates authoritative status until confirm. */
export function useRequirementAiSuggestion(invalidateKey: {
  opportunityId?: string;
  applicationId?: string;
}) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['requirements', invalidateKey] });

  const suggest = useMutation({
    mutationFn: (id: string) => apiPost<Requirement>(`/requirements/${id}/ai-suggestion`),
    onSuccess: invalidate,
  });
  const confirm = useMutation({
    mutationFn: (id: string) =>
      apiPost<Requirement>(`/requirements/${id}/ai-suggestion/confirm`),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: (id: string) =>
      apiPost<Requirement>(`/requirements/${id}/ai-suggestion/reject`),
    onSuccess: invalidate,
  });

  return { suggest, confirm, reject };
}

/** ADMIN-only role change for another user. */
export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      apiPatch<SafeUser>(`/users/${id}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

/** ADMIN-only user directory — keyset-paginated, searchable. Never load all users. */
export function useUsers(filters: { search?: string; role?: UserRole } = {}) {
  const queryFilters: Record<string, string | undefined> = {
    search: filters.search?.trim() || undefined,
    role: filters.role,
  };
  return useInfiniteQuery({
    queryKey: ['users', queryFilters],
    ...paginatedQuery<AdminDirectoryUser>('/users', queryFilters),
  });
}

// --- Deadlines ----------------------------------------------------------------

export interface DeadlineFilters {
  opportunityId?: string;
  applicationId?: string;
  taskId?: string;
  requirementId?: string;
  [key: string]: string | undefined;
}

export function useDeadlines(filters: DeadlineFilters) {
  return useInfiniteQuery({
    queryKey: ['deadlines', filters],
    ...paginatedQuery<Deadline>('/deadlines', filters),
    enabled: Object.values(filters).some(Boolean),
  });
}

export function useCreateDeadline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: Partial<Deadline> & { label: string; date: string }) =>
      apiPost<Deadline>('/deadlines', dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deadlines'] }),
  });
}

export function useUpdateDeadline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Partial<Deadline>) =>
      apiPatch<Deadline>(`/deadlines/${id}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deadlines'] }),
  });
}

export function useDeleteDeadline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/deadlines/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deadlines'] }),
  });
}

// --- Journeys -----------------------------------------------------------------

export function useJourneys() {
  return useInfiniteQuery({
    queryKey: ['journeys', {}],
    ...paginatedQuery<ApplicationJourney>('/journeys', {}),
  });
}

export function useJourney(id: string) {
  return useQuery({
    queryKey: ['journeys', id],
    queryFn: () => apiGet<ApplicationJourney>(`/journeys/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateJourney() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { title: string; goal?: string; universityId?: string; programmeId?: string }) =>
      apiPost<ApplicationJourney>('/journeys', dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['journeys'] }),
  });
}

export function useUpdateJourney() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Partial<ApplicationJourney>) =>
      apiPatch<ApplicationJourney>(`/journeys/${id}`, dto),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['journeys'] });
      queryClient.invalidateQueries({ queryKey: ['journeys', id] });
    },
  });
}

export function useDeleteJourney() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/journeys/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['journeys'] }),
  });
}

// --- Applications ---------------------------------------------------------

export function useApplications(journeyId: string) {
  return useInfiniteQuery({
    queryKey: ['applications', { journeyId }],
    ...paginatedQuery<Application>('/applications', { journeyId }),
    enabled: Boolean(journeyId),
  });
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: ['applications', id],
    queryFn: () => apiGet<Application>(`/applications/${id}`),
    enabled: Boolean(id),
    // A soft-deleted (or otherwise gone) Application 404s — treat it exactly
    // like "not found", never retry into a stale cache entry.
    retry: false,
  });
}

export function useCreateApplication(journeyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: {
      title: string;
      applicationType?: string;
      opportunityId?: string;
      portal?: string;
      externalUrl?: string;
      notes?: string;
      startDate?: string;
    }) => apiPost<Application>('/applications', { ...dto, journeyId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications', { journeyId }] }),
  });
}

export function useUpdateApplication(journeyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Partial<Application>) =>
      apiPatch<Application>(`/applications/${id}`, dto),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['applications', { journeyId }] });
      queryClient.invalidateQueries({ queryKey: ['applications', id] });
    },
  });
}

/** Soft-delete — see Track 2 §0. The Application and all its child resources disappear from every normal read path immediately. */
export function useDeleteApplication(journeyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/applications/${id}`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['applications', { journeyId }] });
      queryClient.removeQueries({ queryKey: ['applications', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['deadlines'] });
      queryClient.invalidateQueries({ queryKey: ['requirements'] });
    },
  });
}

/** Owner-only restore of a soft-deleted application (within retention). */
export function useRestoreApplication(journeyId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<Application>(`/applications/${id}/restore`),
    onSuccess: (data) => {
      if (journeyId) {
        queryClient.invalidateQueries({ queryKey: ['applications', { journeyId }] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['applications'] });
      }
      queryClient.setQueryData(['applications', data.id], data);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['deadlines'] });
      queryClient.invalidateQueries({ queryKey: ['requirements'] });
    },
  });
}

// --- Application documents (attach/detach, structurally bounded — not paginated) ---

export function useApplicationDocuments(applicationId: string) {
  return useQuery({
    queryKey: ['applications', applicationId, 'documents'],
    queryFn: () => apiGet<ApplicationDocument[]>(`/applications/${applicationId}/documents`),
    enabled: Boolean(applicationId),
  });
}

export function useAttachDocument(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { documentId: string; label?: string }) =>
      apiPost<ApplicationDocument>(`/applications/${applicationId}/documents`, dto),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['applications', applicationId, 'documents'] }),
  });
}

export function useDetachDocument(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) =>
      apiDelete<void>(`/applications/${applicationId}/documents/${documentId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['applications', applicationId, 'documents'] }),
  });
}

// --- Application snapshots (append-only revisions + explicit delete) --------

export function useApplicationSnapshots(applicationId: string) {
  return useQuery({
    queryKey: ['applications', applicationId, 'snapshots'],
    queryFn: () => apiGet<ApplicationSnapshot[]>(`/applications/${applicationId}/snapshots`),
    enabled: Boolean(applicationId),
  });
}

export function useApplicationSnapshot(applicationId: string, snapshotId: string) {
  return useQuery({
    queryKey: ['applications', applicationId, 'snapshots', snapshotId],
    queryFn: () =>
      apiGet<ApplicationSnapshot>(`/applications/${applicationId}/snapshots/${snapshotId}`),
    enabled: Boolean(applicationId && snapshotId),
  });
}

export function useCreateSnapshot(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { label?: string }) =>
      apiPost<ApplicationSnapshot>(`/applications/${applicationId}/snapshots`, dto),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['applications', applicationId, 'snapshots'] }),
  });
}

/** Append-only edit — creates a new revision; previous row stays intact. */
export function useEditSnapshot(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      snapshotId,
      ...dto
    }: {
      snapshotId: string;
      label?: string | null;
      data?: Record<string, unknown>;
    }) =>
      apiPost<ApplicationSnapshot>(
        `/applications/${applicationId}/snapshots/${snapshotId}/revisions`,
        dto,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['applications', applicationId, 'snapshots'] }),
  });
}

export function useDeleteSnapshot(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (snapshotId: string) =>
      apiDelete<void>(`/applications/${applicationId}/snapshots/${snapshotId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['applications', applicationId, 'snapshots'] }),
  });
}

// --- Tasks ----------------------------------------------------------------

/**
 * `journeyId`/`applicationId` are BOTH optional on this endpoint (unlike
 * Requirements/Deadlines, which 400 without a parent filter) — confirmed
 * directly in tasks.service.ts's `findAllForUser()`: with no filters it
 * returns every task the user owns, scoped only by ownership, across every
 * journey. That's what makes a real cross-journey "My Tasks" page possible
 * without any client-side fan-out per journey.
 */
export function useTasks(filters: { journeyId?: string; applicationId?: string } = {}) {
  return useInfiniteQuery({
    queryKey: ['tasks', filters],
    ...paginatedQuery<Task>('/tasks', filters),
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['tasks', 'detail', id],
    queryFn: () => apiGet<Task>(`/tasks/${id}`),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useCreateTask(journeyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: {
      title: string;
      description?: string;
      priority?: string;
      dueDate?: string;
      applicationId?: string;
      requirementId?: string;
      dependsOnTaskId?: string | null;
      dependencyType?: string;
    }) => apiPost<Task>('/tasks', { ...dto, journeyId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', { journeyId }] }),
  });
}

export function useUpdateTask(journeyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Partial<Task>) =>
      apiPatch<Task>(`/tasks/${id}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', { journeyId }] }),
  });
}

export function useDeleteTask(journeyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/tasks/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', { journeyId }] }),
  });
}

// --- Documents (owned directly; multipart upload) ----------------------------

export function useDocuments() {
  return useInfiniteQuery({
    queryKey: ['documents', {}],
    ...paginatedQuery<AppDocument>('/documents', {}),
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: ['documents', id],
    queryFn: () => apiGet<AppDocument>(`/documents/${id}`),
    enabled: Boolean(id),
  });
}

export function useDocumentVersions(id: string) {
  return useQuery({
    queryKey: ['documents', id, 'versions'],
    queryFn: () => apiGet<AppDocument[]>(`/documents/${id}/versions`),
    enabled: Boolean(id),
  });
}

/**
 * Fetches a fresh signed delivery URL on demand — never cached/reused across
 * renders as a stored value, and never constructed client-side. Callers
 * should call `refetch()`/invoke this right before opening the URL, not read
 * a long-lived cached one.
 */
export function useDocumentDownloadUrl(id: string) {
  return useQuery({
    queryKey: ['documents', id, 'download-url'],
    queryFn: () => apiGet<SignedDownloadUrl>(`/documents/${id}/download-url`),
    enabled: false,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { file: File; title: string; documentType: string; notes?: string }) => {
      const formData = new FormData();
      formData.append('file', dto.file);
      formData.append('title', dto.title);
      formData.append('documentType', dto.documentType);
      if (dto.notes) formData.append('notes', dto.notes);
      return apiPostForm<AppDocument>('/documents', formData);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });
}

export function useUploadDocumentVersion(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { file: File; title?: string; documentType?: string; notes?: string }) => {
      const formData = new FormData();
      formData.append('file', dto.file);
      if (dto.title) formData.append('title', dto.title);
      if (dto.documentType) formData.append('documentType', dto.documentType);
      if (dto.notes) formData.append('notes', dto.notes);
      return apiPostForm<AppDocument>(`/documents/${documentId}/versions`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['documents', documentId, 'versions'] });
    },
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string; title?: string; notes?: string }) =>
      apiPatch<AppDocument>(`/documents/${id}`, dto),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['documents', id] });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/documents/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });
}
