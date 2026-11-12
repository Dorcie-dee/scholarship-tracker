'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, friendlyErrorMessage } from '@/lib/api-client';
import { deadlineStatusMeta, relativeDays } from '@/lib/status';
import { Button, buttonVariants } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { CheckToggle } from '@/components/ui/check-toggle';
import { ApplicationCard } from '@/components/applications/application-card';
import {
  ApplicationsIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  PlusIcon,
  SparklesIcon,
} from '@/components/icons';
import {
  groupBy,
  isDeadlineUpcoming,
  isTaskOpen,
  requirementProgress,
  soonestUpcomingDeadline,
  useAllDeadlines,
  useAllRequirements,
  useAllTasks,
  useApplications,
  useJourneys,
  useOpportunitiesByIds,
  type Deadline,
  type PaginatedResult,
  type Task,
} from '@/_lib/application-data';

/** Statuses that mean an Application is no longer actively being worked. */
const TERMINAL_APPLICATION_STATUSES = new Set(['accepted', 'rejected', 'withdrawn']);

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function firstName(name: string | null, email: string): string {
  const source = (name ?? email.split('@')[0]).trim();
  return source.split(/\s+/)[0] ?? source;
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ApplicationsIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon size={20} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="font-display text-2xl font-semibold leading-tight text-ink">{value}</p>
        <p className="truncate text-xs font-medium text-ink-soft">{label}</p>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8 p-5 sm:p-8" aria-busy="true" aria-label="Loading dashboard">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-line-soft" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-line-soft" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-xl bg-line-soft" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl bg-line-soft" />
        ))}
      </div>
    </div>
  );
}

type DueSoonItem =
  | { kind: 'task'; date: string; task: Task }
  | { kind: 'deadline'; date: string; deadline: Deadline };

export default function DashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const journeysQuery = useJourneys();
  const applicationsQuery = useApplications();
  const tasksQuery = useAllTasks();

  const applications = useMemo(() => applicationsQuery.data?.items ?? [], [applicationsQuery.data]);
  const opportunityIds = useMemo(
    () => Array.from(new Set(applications.map((a) => a.opportunityId).filter((id): id is string => Boolean(id)))),
    [applications],
  );

  const requirementsQuery = useAllRequirements();
  const deadlinesQuery = useAllDeadlines();
  const opportunitiesQuery = useOpportunitiesByIds(opportunityIds);

  const toggleTask = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'todo' | 'done' }) =>
      apiFetch<Task>(`/tasks/${id}`, { method: 'PATCH', body: { status } }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const previous = queryClient.getQueryData<PaginatedResult<Task>>(['tasks']);
      queryClient.setQueryData<PaginatedResult<Task>>(['tasks'], (old) =>
        old ? { ...old, items: old.items.map((t) => (t.id === id ? { ...t, status } : t)) } : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['tasks'], context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const isInitialLoading = journeysQuery.isLoading || applicationsQuery.isLoading || tasksQuery.isLoading;
  const loadError = journeysQuery.error ?? applicationsQuery.error ?? tasksQuery.error;

  // Each of these is now one flat list (not one query per application), so
  // building the per-application maps is just a client-side group-by — see
  // `app/_lib/application-data.ts`'s doc comment for why this no longer
  // fans out a request per application the way it originally did.
  const requirementsByApplicationId = useMemo(() => {
    const grouped = groupBy(requirementsQuery.data?.items ?? [], (r) => r.applicationId);
    const progress = new Map<string, ReturnType<typeof requirementProgress>>();
    grouped.forEach((items, id) => progress.set(id, requirementProgress(items)));
    return progress;
  }, [requirementsQuery.data]);

  const deadlinesByApplicationId = useMemo(
    () => groupBy(deadlinesQuery.data?.items ?? [], (d) => d.applicationId),
    [deadlinesQuery.data],
  );

  const opportunityById = useMemo(
    () => new Map((opportunitiesQuery.data?.items ?? []).map((o) => [o.id, o])),
    [opportunitiesQuery.data],
  );

  // The full "due soon" feed, not `deadlinesByApplicationId`'s values — that
  // map is grouped BY applicationId and so silently excludes a deadline
  // reachable only via a journey-level task/requirement (no applicationId
  // of its own), which the "what's coming up" feed should still surface.
  const allDeadlines = deadlinesQuery.data?.items ?? [];
  const tasks = tasksQuery.data?.items ?? [];

  const activeApplicationsCount = applications.filter((a) => !TERMINAL_APPLICATION_STATUSES.has(a.status)).length;

  const requirementsLoaded = !requirementsQuery.isLoading;
  const overallProgress = useMemo(() => {
    let met = 0;
    let total = 0;
    requirementsByApplicationId.forEach((p) => {
      met += p.met;
      total += p.total;
    });
    return total > 0 ? Math.round((met / total) * 100) : null;
  }, [requirementsByApplicationId]);

  const deadlinesLoaded = !deadlinesQuery.isLoading;
  const upcomingDeadlineCount = allDeadlines.filter((d) => isDeadlineUpcoming(d.status)).length;

  const openTaskCount = tasks.filter((t) => isTaskOpen(t.status)).length;

  const dueSoonItems: DueSoonItem[] = useMemo(() => {
    const items: DueSoonItem[] = [];
    tasks.forEach((task) => {
      if (isTaskOpen(task.status) && task.dueDate) {
        items.push({ kind: 'task', date: task.dueDate, task });
      }
    });
    allDeadlines.forEach((deadline) => {
      if (isDeadlineUpcoming(deadline.status)) {
        items.push({ kind: 'deadline', date: deadline.date, deadline });
      }
    });
    return items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 6);
  }, [tasks, allDeadlines]);

  const applicationsById = useMemo(() => new Map(applications.map((a) => [a.id, a])), [applications]);

  const featuredApplications = useMemo(() => {
    const decorated = applications.map((application) => {
      const deadlines = deadlinesByApplicationId.get(application.id);
      const nextDeadline = soonestUpcomingDeadline(deadlines);
      return { application, nextDeadline };
    });
    decorated.sort((a, b) => {
      if (a.nextDeadline && b.nextDeadline) {
        return new Date(a.nextDeadline.date).getTime() - new Date(b.nextDeadline.date).getTime();
      }
      if (a.nextDeadline) return -1;
      if (b.nextDeadline) return 1;
      return new Date(b.application.updatedAt).getTime() - new Date(a.application.updatedAt).getTime();
    });
    return decorated.slice(0, 4);
  }, [applications, deadlinesByApplicationId]);

  if (isInitialLoading) {
    return <DashboardSkeleton />;
  }

  if (loadError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm font-medium text-danger">{friendlyErrorMessage(loadError)}</p>
        <Button
          onClick={() => {
            void journeysQuery.refetch();
            void applicationsQuery.refetch();
            void tasksQuery.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const isNewUser = (journeysQuery.data?.items.length ?? 0) === 0;

  const summaryLine = isNewUser
    ? "Let's find your first scholarship to apply for."
    : dueSoonItems.length > 0
      ? `You have ${dueSoonItems.length} thing${dueSoonItems.length === 1 ? '' : 's'} coming up — nothing you can't handle.`
      : "You're all caught up. Nothing urgent on your plate right now.";

  return (
    <div className="flex flex-col gap-8 p-5 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-page-title font-semibold text-ink sm:text-page-title-lg">
            {greeting()}, {firstName(user?.name ?? null, user?.email ?? '')}.
          </h1>
          <p className="mt-1.5 text-supporting text-ink-soft">{summaryLine}</p>
        </div>
        <Link href="/applications" className={buttonVariants({ className: 'flex-none' })}>
          <PlusIcon size={18} aria-hidden="true" />
          New application
        </Link>
      </div>

      {isNewUser ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-line bg-surface px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <SparklesIcon size={24} aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-section-heading font-semibold text-ink">Welcome to Schola</h2>
            <p className="mx-auto mt-1.5 max-w-sm text-supporting text-ink-soft">
              Add the university or scholarship you're applying to and your deadlines, tasks and progress will
              all show up right here.
            </p>
          </div>
          <Link href="/applications" className={buttonVariants()}>
            <PlusIcon size={18} aria-hidden="true" />
            Get started
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={ApplicationsIcon} label="Active applications" value={String(activeApplicationsCount)} />
            <StatCard
              icon={CheckIcon}
              label="Requirements complete"
              value={requirementsLoaded ? (overallProgress === null ? '—' : `${overallProgress}%`) : '…'}
            />
            <StatCard
              icon={CalendarIcon}
              label="Upcoming deadlines"
              value={deadlinesLoaded ? String(upcomingDeadlineCount) : '…'}
            />
            <StatCard icon={ClockIcon} label="Open tasks" value={String(openTaskCount)} />
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-section-heading font-semibold text-ink">Due soon</h2>
            {dueSoonItems.length === 0 ? (
              <div className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-ink-soft">
                Nothing due soon — enjoy the breathing room.
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
                {dueSoonItems.map((item) => {
                  if (item.kind === 'task') {
                    const task = item.task;
                    const relatedApp = task.applicationId ? applicationsById.get(task.applicationId) : undefined;
                    return (
                      <li key={`task-${task.id}`} className="flex items-center gap-3 px-4 py-3">
                        <CheckToggle
                          checked={false}
                          aria-label={`Mark "${task.title}" as done`}
                          onClick={() => toggleTask.mutate({ id: task.id, status: 'done' })}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{task.title}</p>
                          {relatedApp && <p className="truncate text-xs text-ink-faint">{relatedApp.title}</p>}
                        </div>
                        <span className="flex-none text-xs font-medium text-ink-soft">
                          {relativeDays(task.dueDate)}
                        </span>
                      </li>
                    );
                  }
                  const deadline = item.deadline;
                  const meta = deadlineStatusMeta(deadline.status);
                  const relatedApp = deadline.applicationId ? applicationsById.get(deadline.applicationId) : undefined;
                  return (
                    <li key={`deadline-${deadline.id}`} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent-soft text-accent">
                        <CalendarIcon size={13} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{deadline.label}</p>
                        {relatedApp && <p className="truncate text-xs text-ink-faint">{relatedApp.title}</p>}
                      </div>
                      <Pill tone={meta.tone} className="flex-none">
                        {meta.label}
                      </Pill>
                      <span className="flex-none text-xs font-medium text-ink-soft">{relativeDays(deadline.date)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-section-heading font-semibold text-ink">Your applications</h2>
              <Link href="/applications" className="text-sm font-semibold text-primary hover:text-primary-hover">
                View all
              </Link>
            </div>
            {applications.length === 0 ? (
              <div className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-ink-soft">
                You have a journey started, but no applications in it yet.{' '}
                <Link href="/applications" className="font-semibold text-primary hover:text-primary-hover">
                  Add one
                </Link>
                .
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {featuredApplications.map(({ application, nextDeadline }) => (
                  <ApplicationCard
                    key={application.id}
                    application={application}
                    opportunity={application.opportunityId ? opportunityById.get(application.opportunityId) : null}
                    progress={requirementsByApplicationId.get(application.id) ?? { met: 0, total: 0, percent: 0 }}
                    nextDeadline={nextDeadline}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
