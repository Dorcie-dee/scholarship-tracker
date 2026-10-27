'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef, useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, friendlyErrorMessage } from '@/lib/api-client';
import { applicationStatusMeta, REQUIREMENT_MET_STATUSES } from '@/lib/status';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { PILL_TONE_CLASSES } from '@/components/ui/pill';
import { ArrowLeftIcon, TrashIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { ApplicationDetailsCard } from './application-details-card';
import { RequirementsTab } from './requirements-tab';
import { TasksTab } from './tasks-tab';
import { DeadlinesTab } from './deadlines-tab';
import { DocumentsTab } from './documents-tab';
import { SnapshotsTab } from './snapshots-tab';
import { Spinner, TabError } from './tab-support';
import {
  APPLICATION_STATUS_VALUES,
  type Application,
  type ApplicationDocumentLink,
  type ApplicationSnapshot,
  type Deadline,
  type Opportunity,
  type PaginatedResult,
  type Requirement,
  type Task,
  type University,
} from './types';

/**
 * This page is the single source of truth for one Application: its status,
 * progress, requirements, tasks, deadlines, attached documents and
 * snapshots. See `server/services/applications.service.ts` (+ requirements/
 * tasks/deadlines/documents services) for every rule this page respects.
 */

const TABS = [
  { id: 'requirements', label: 'Requirements' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'deadlines', label: 'Deadlines' },
  { id: 'documents', label: 'Documents' },
  { id: 'snapshots', label: 'Snapshots' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/**
 * Duplicates `Pill`'s tone→class mapping (not exported from
 * `components/ui/pill.tsx`, and that file is off-limits to edit here) so the
 * status control can look exactly like a Pill while actually being a real,
 * interactive `<select>`.
 */

function FullPageSpinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary" role="status" aria-label="Loading" />
    </div>
  );
}

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabId>('requirements');
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(() => new Set(['requirements']));
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectTab(tab: TabId) {
    setActiveTab(tab);
    setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }

  function handleTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = TABS.length;
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % count;
    else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + count) % count;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = count - 1;
    if (nextIndex !== null) {
      e.preventDefault();
      selectTab(TABS[nextIndex].id);
      tabRefs.current[nextIndex]?.focus();
    }
  }

  const applicationQuery = useQuery({
    queryKey: ['application', id],
    queryFn: () => apiFetch<Application>(`/applications/${id}`),
    enabled: Boolean(id),
  });

  const application = applicationQuery.data;
  const opportunityId = application?.opportunityId ?? null;

  const opportunityQuery = useQuery({
    queryKey: ['opportunity', opportunityId],
    queryFn: () => apiFetch<Opportunity>(`/opportunities/${opportunityId}`),
    enabled: Boolean(opportunityId),
  });

  const universityId = opportunityQuery.data?.universityId ?? null;

  const universityQuery = useQuery({
    queryKey: ['university', universityId],
    queryFn: () => apiFetch<University>(`/universities/${universityId}`),
    enabled: Boolean(universityId),
  });

  // Needed for the progress bar in the header, so it loads up front rather
  // than only when the Requirements tab is selected (unlike the other four
  // tabs below, which load lazily on first visit).
  const requirementsQuery = useQuery({
    queryKey: ['requirements', id],
    queryFn: () => apiFetch<PaginatedResult<Requirement>>(`/requirements?applicationId=${id}&limit=100&order=asc`),
    enabled: Boolean(id) && !application?.deletedAt,
  });

  const tasksQuery = useQuery({
    queryKey: ['tasks', id],
    queryFn: () => apiFetch<PaginatedResult<Task>>(`/tasks?applicationId=${id}&limit=100`),
    enabled: visitedTabs.has('tasks'),
  });

  const deadlinesQuery = useQuery({
    queryKey: ['deadlines', id],
    queryFn: () => apiFetch<PaginatedResult<Deadline>>(`/deadlines?applicationId=${id}&limit=100`),
    enabled: visitedTabs.has('deadlines'),
  });

  const documentsQuery = useQuery({
    queryKey: ['application-documents', id],
    queryFn: () => apiFetch<ApplicationDocumentLink[]>(`/applications/${id}/documents`),
    enabled: visitedTabs.has('documents'),
  });

  const snapshotsQuery = useQuery({
    queryKey: ['snapshots', id],
    queryFn: () => apiFetch<ApplicationSnapshot[]>(`/applications/${id}/snapshots`),
    enabled: visitedTabs.has('snapshots'),
  });

  const updateStatus = useMutation({
    mutationFn: (status: string) => apiFetch<Application>(`/applications/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: (data) => queryClient.setQueryData(['application', id], data),
  });

  // The GET route excludes soft-deleted rows entirely (see
  // `applications.service.ts`'s `findLiveApplicationWithJourney`), so a
  // refetch after delete would 404 instead of showing the deleted state —
  // write the result straight into the cache instead of invalidating it.
  const deleteApplication = useMutation({
    mutationFn: () => apiFetch<void>(`/applications/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.setQueryData<Application | undefined>(['application', id], (prev) =>
        prev ? { ...prev, deletedAt: new Date().toISOString() } : prev,
      );
    },
  });

  const restoreApplication = useMutation({
    mutationFn: () => apiFetch<Application>(`/applications/${id}/restore`, { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.setQueryData(['application', id], data);
      void queryClient.invalidateQueries({ queryKey: ['requirements', id] });
    },
  });

  const backLink = (
    <Link href="/applications" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
      <ArrowLeftIcon size={16} aria-hidden="true" />
      Back to applications
    </Link>
  );

  if (applicationQuery.isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        {backLink}
        <FullPageSpinner />
      </div>
    );
  }

  if (applicationQuery.isError || !application) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        {backLink}
        <Card className="mt-6 p-6">
          <TabError message={friendlyErrorMessage(applicationQuery.error) || 'This application could not be found.'} />
        </Card>
      </div>
    );
  }

  if (application.deletedAt) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        {backLink}
        <Card className="mt-6 flex flex-col items-start gap-3 p-6">
          <h1 className="font-display text-2xl font-semibold text-ink">{application.title}</h1>
          <p className="text-sm text-ink-soft">
            This application has been deleted. You can restore it any time before it's permanently removed, or leave it be.
          </p>
          {restoreApplication.isError && <TabError message={friendlyErrorMessage(restoreApplication.error)} />}
          <Button onClick={() => restoreApplication.mutate()} disabled={restoreApplication.isPending}>
            {restoreApplication.isPending ? 'Restoring…' : 'Restore application'}
          </Button>
        </Card>
      </div>
    );
  }

  const requirements = requirementsQuery.data?.items;
  const totalRequirements = requirements?.length ?? 0;
  const metRequirements = requirements?.filter((r) => REQUIREMENT_MET_STATUSES.has(r.status)).length ?? 0;
  const progressPercent = totalRequirements > 0 ? Math.round((metRequirements / totalRequirements) * 100) : 0;
  const statusMeta = applicationStatusMeta(application.status);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      {backLink}

      <header className="mt-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-semibold text-ink">{application.title}</h1>
            {opportunityId && opportunityQuery.data && (
              <p className="mt-1 text-sm text-ink-soft">
                {opportunityQuery.data.title}
                {universityQuery.data ? ` · ${universityQuery.data.name}` : ''}
              </p>
            )}
          </div>
          <div className="flex flex-none items-center gap-2">
            <label className="sr-only" htmlFor="application-status">
              Application status
            </label>
            <select
              id="application-status"
              value={application.status}
              onChange={(e) => updateStatus.mutate(e.target.value)}
              disabled={updateStatus.isPending}
              className={cn(
                'h-8 cursor-pointer appearance-none rounded-full border-0 px-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60',
                PILL_TONE_CLASSES[statusMeta.tone],
              )}
            >
              {APPLICATION_STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {applicationStatusMeta(s).label}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (window.confirm('Delete this application? You can restore it later from here, within the retention window.')) {
                  deleteApplication.mutate();
                }
              }}
              disabled={deleteApplication.isPending}
            >
              <TrashIcon size={14} aria-hidden="true" />
              {deleteApplication.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </div>
        {updateStatus.isError && <TabError message={friendlyErrorMessage(updateStatus.error)} />}
        {deleteApplication.isError && <TabError message={friendlyErrorMessage(deleteApplication.error)} />}

        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink">Requirements progress</p>
            {requirementsQuery.isLoading ? (
              <span className="text-sm text-ink-soft">Loading…</span>
            ) : (
              <p className="text-sm text-ink-soft">
                {metRequirements} of {totalRequirements} met
              </p>
            )}
          </div>
          <ProgressBar value={progressPercent} className="mt-2" />
        </Card>

        <ApplicationDetailsCard application={application} />
      </header>

      <div className="mt-6">
        <div role="tablist" aria-label="Application sections" className="flex gap-1 overflow-x-auto border-b border-line">
          {TABS.map((tab, index) => (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
              className={cn(
                'whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
                activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-ink-soft hover:text-ink',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} tabIndex={0} className="py-5">
          {activeTab === 'requirements' && (
            <RequirementsTab
              applicationId={id}
              requirements={requirements}
              isLoading={requirementsQuery.isLoading}
              isError={requirementsQuery.isError}
              error={requirementsQuery.error}
            />
          )}
          {activeTab === 'tasks' &&
            (!visitedTabs.has('tasks') || tasksQuery.isLoading ? (
              <Spinner label="Loading tasks…" />
            ) : (
              <TasksTab
                applicationId={id}
                journeyId={application.journeyId}
                tasks={tasksQuery.data?.items}
                isLoading={tasksQuery.isLoading}
                isError={tasksQuery.isError}
                error={tasksQuery.error}
              />
            ))}
          {activeTab === 'deadlines' &&
            (!visitedTabs.has('deadlines') || deadlinesQuery.isLoading ? (
              <Spinner label="Loading deadlines…" />
            ) : (
              <DeadlinesTab
                applicationId={id}
                deadlines={deadlinesQuery.data?.items}
                isLoading={deadlinesQuery.isLoading}
                isError={deadlinesQuery.isError}
                error={deadlinesQuery.error}
              />
            ))}
          {activeTab === 'documents' &&
            (!visitedTabs.has('documents') || documentsQuery.isLoading ? (
              <Spinner label="Loading documents…" />
            ) : (
              <DocumentsTab
                applicationId={id}
                links={documentsQuery.data}
                isLoading={documentsQuery.isLoading}
                isError={documentsQuery.isError}
                error={documentsQuery.error}
              />
            ))}
          {activeTab === 'snapshots' &&
            (!visitedTabs.has('snapshots') || snapshotsQuery.isLoading ? (
              <Spinner label="Loading snapshots…" />
            ) : (
              <SnapshotsTab
                applicationId={id}
                snapshots={snapshotsQuery.data}
                isLoading={snapshotsQuery.isLoading}
                isError={snapshotsQuery.isError}
                error={snapshotsQuery.error}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
