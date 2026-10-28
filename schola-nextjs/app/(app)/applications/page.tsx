'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, friendlyErrorMessage } from '@/lib/api-client';
import { applicationStatusMeta } from '@/lib/status';
import { cn } from '@/lib/cn';
import { Button, buttonVariants } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { FieldError, Input, Label } from '@/components/ui/form';
import { ApplicationCard } from '@/components/applications/application-card';
import { PlusIcon, SearchIcon, XIcon } from '@/components/icons';
import {
  groupBy,
  requirementProgress,
  soonestUpcomingDeadline,
  useAllDeadlines,
  useAllRequirements,
  useApplications,
  useJourneys,
  useOpportunitiesByIds,
  type Application,
} from '@/_lib/application-data';

/**
 * Mirrors `server/lib/enums.ts`'s `ApplicationStatus` the same way
 * `app/lib/status.ts` already does (that file's own doc comment explains
 * why: frontend pages don't import backend enums directly, to keep the two
 * layers independent) — update both together if the backend enum changes.
 */
const APPLICATION_STATUS_VALUES = [
  'not_started',
  'in_progress',
  'submitted',
  'under_review',
  'interview',
  'offer',
  'accepted',
  'rejected',
  'withdrawn',
] as const;

const SELECT_FIELD_CLASSES =
  'h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-5 sm:p-8" aria-busy="true" aria-label="Loading your applications">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-line-soft" />
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-7 w-20 animate-pulse rounded-full bg-line-soft" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl bg-line-soft" />
        ))}
      </div>
    </div>
  );
}

function NewApplicationForm({
  journeys,
  onClose,
}: {
  journeys: Array<{ id: string; title: string }>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [journeyId, setJourneyId] = useState(journeys[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createApplication = useMutation({
    mutationFn: (vars: { journeyId: string; title: string }) =>
      apiFetch<Application>('/applications', { method: 'POST', body: vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
      onClose();
    },
    onError: (err) => setError(friendlyErrorMessage(err)),
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!journeyId) {
      setError('Choose a journey for this application.');
      return;
    }
    if (!title.trim()) {
      setError('Give this application a title.');
      return;
    }
    createApplication.mutate({ journeyId, title: title.trim() });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-end sm:gap-3"
    >
      <div className="flex-1">
        <Label htmlFor="new-app-journey">Journey</Label>
        <select
          id="new-app-journey"
          className={SELECT_FIELD_CLASSES}
          value={journeyId}
          onChange={(e) => setJourneyId(e.target.value)}
        >
          {journeys.map((journey) => (
            <option key={journey.id} value={journey.id}>
              {journey.title}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1">
        <Label htmlFor="new-app-title">Title</Label>
        <Input
          id="new-app-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Chevening Scholarship"
        />
      </div>
      <div className="flex gap-2 sm:flex-none">
        <Button type="submit" disabled={createApplication.isPending} className="flex-1 sm:flex-none">
          {createApplication.isPending ? 'Adding…' : 'Add application'}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose} aria-label="Cancel adding an application">
          <XIcon size={18} aria-hidden="true" />
        </Button>
      </div>
      {error && (
        <div className="sm:basis-full">
          <FieldError>{error}</FieldError>
        </div>
      )}
    </form>
  );
}

export default function ApplicationsPage() {
  const journeysQuery = useJourneys();
  const applicationsQuery = useApplications();
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const journeys = journeysQuery.data?.items ?? [];
  const applications = applicationsQuery.data?.items ?? [];
  const opportunityIds = Array.from(
    new Set(applications.map((a) => a.opportunityId).filter((id): id is string => Boolean(id))),
  );

  // Flat, constant-count queries (not one per application) — see
  // `app/_lib/application-data.ts`'s doc comment.
  const requirementsQuery = useAllRequirements();
  const deadlinesQuery = useAllDeadlines();
  const opportunitiesQuery = useOpportunitiesByIds(opportunityIds);

  const requirementsByApplicationId = new Map<string, ReturnType<typeof requirementProgress>>();
  groupBy(requirementsQuery.data?.items ?? [], (r) => r.applicationId).forEach((items, id) =>
    requirementsByApplicationId.set(id, requirementProgress(items)),
  );

  const deadlinesByApplicationId = groupBy(deadlinesQuery.data?.items ?? [], (d) => d.applicationId);

  const opportunityById = new Map((opportunitiesQuery.data?.items ?? []).map((o) => [o.id, o]));

  const isInitialLoading = journeysQuery.isLoading || applicationsQuery.isLoading;
  const loadError = journeysQuery.error ?? applicationsQuery.error;

  if (isInitialLoading) {
    return <PageSkeleton />;
  }

  if (loadError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm font-medium text-danger">{friendlyErrorMessage(loadError)}</p>
        <Button
          onClick={() => {
            void journeysQuery.refetch();
            void applicationsQuery.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (journeys.length === 0) {
    return (
      <div className="flex flex-col gap-8 p-5 sm:p-8">
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">My applications</h1>
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-line bg-surface px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <SearchIcon size={24} aria-hidden="true" />
          </span>
          <div>
            <p className="font-display text-lg font-semibold text-ink">No applications yet</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-soft">
              Start by finding a scholarship, grant or programme worth applying to — we'll help you track
              everything from there.
            </p>
          </div>
          <Link href="/discover" className={buttonVariants()}>
            <SearchIcon size={18} aria-hidden="true" />
            Discover opportunities
          </Link>
        </div>
      </div>
    );
  }

  const filteredApplications = selectedStatus ? applications.filter((a) => a.status === selectedStatus) : applications;

  const groups = journeys
    .map((journey) => ({
      journey,
      totalCount: applications.filter((a) => a.journeyId === journey.id).length,
      apps: filteredApplications.filter((a) => a.journeyId === journey.id),
    }))
    .filter((group) => group.totalCount > 0 || !selectedStatus);

  return (
    <div className="flex flex-col gap-8 p-5 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">My applications</h1>
          <p className="mt-1.5 text-sm text-ink-soft">Every application you're tracking, grouped by journey.</p>
        </div>
        <div className="flex flex-none gap-2">
          <Button variant="secondary" onClick={() => setIsCreating((v) => !v)}>
            <PlusIcon size={18} aria-hidden="true" />
            Add directly
          </Button>
          <Link href="/discover" className={buttonVariants()}>
            <SearchIcon size={18} aria-hidden="true" />
            New application
          </Link>
        </div>
      </div>

      {isCreating && <NewApplicationForm journeys={journeys} onClose={() => setIsCreating(false)} />}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        <button
          type="button"
          onClick={() => setSelectedStatus(null)}
          aria-pressed={selectedStatus === null}
          className="rounded-full"
        >
          <Pill
            tone="neutral"
            className={cn('transition-opacity', selectedStatus === null ? 'opacity-100' : 'opacity-50 hover:opacity-80')}
          >
            All
          </Pill>
        </button>
        {APPLICATION_STATUS_VALUES.map((status) => {
          const meta = applicationStatusMeta(status);
          const active = selectedStatus === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setSelectedStatus(active ? null : status)}
              aria-pressed={active}
              className="rounded-full"
            >
              <Pill tone={meta.tone} className={cn('transition-opacity', active ? 'opacity-100' : 'opacity-50 hover:opacity-80')}>
                {meta.label}
              </Pill>
            </button>
          );
        })}
      </div>

      {filteredApplications.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-ink-soft">
          No applications match that status yet.
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(({ journey, apps, totalCount }) => (
            <section key={journey.id} className="flex flex-col gap-3">
              <h2 className="flex items-baseline gap-2 font-display text-lg font-semibold text-ink">
                {journey.title}
                <span className="font-sans text-sm font-normal text-ink-faint">
                  {totalCount} application{totalCount === 1 ? '' : 's'}
                </span>
              </h2>
              {apps.length === 0 ? (
                <p className="text-sm text-ink-faint">No applications with this status in this journey.</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {apps.map((application) => {
                    const deadlines = deadlinesByApplicationId.get(application.id);
                    return (
                      <ApplicationCard
                        key={application.id}
                        application={application}
                        opportunity={application.opportunityId ? opportunityById.get(application.opportunityId) : null}
                        progress={requirementsByApplicationId.get(application.id) ?? { met: 0, total: 0, percent: 0 }}
                        nextDeadline={soonestUpcomingDeadline(deadlines)}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
