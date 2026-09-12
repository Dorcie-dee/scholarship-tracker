'use client';

import {
  ArrowRightOutlined,
  CheckSquareOutlined,
  FileTextOutlined,
  PlusOutlined,
  StarOutlined,
} from '@ant-design/icons';
import { Button } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CardGridSkeleton, ListSkeleton, StatSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { StartTrackingModal } from '@/components/StartTrackingModal';
import { StatusTag } from '@/components/StatusTag';
import { useAuth } from '@/lib/auth-context';
import { JourneyStatus, TaskStatus } from '@/lib/shared-types';
import { flattenPages, useJourneys, useTasks } from '@/lib/queries';
import type { ApplicationJourney } from '@/lib/types';

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function JourneyCard({ journey }: { journey: ApplicationJourney }) {
  return (
    <Link href={`/journeys/${journey.id}`} className="block group no-underline">
      <article className="surface-interactive h-full p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <StatusTag value={journey.status} />
          <ArrowRightOutlined className="text-[color:var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity text-xs mt-1" />
        </div>
        <h3
          className="m-0 text-[17px] font-semibold text-[color:var(--ink)] leading-snug group-hover:text-[color:var(--accent)] transition-colors"
          style={{ fontFamily: 'var(--font-display), var(--font-sans), sans-serif' }}
        >
          {journey.title}
        </h3>
        {journey.goal ? (
          <p className="m-0 text-sm text-[color:var(--text-secondary)] line-clamp-2 leading-relaxed">
            {journey.goal}
          </p>
        ) : (
          <p className="m-0 text-sm text-[color:var(--text-muted)] italic">No goal set yet</p>
        )}
        {(journey.university || journey.programme) && (
          <p className="m-0 text-xs text-[color:var(--text-muted)] truncate">
            {[journey.university?.name, journey.programme?.name].filter(Boolean).join(' · ')}
          </p>
        )}
        <div className="mt-auto pt-3 border-t border-[color:var(--border)] flex items-center justify-between text-xs text-[color:var(--text-muted)]">
          <span>Opened {dayjs(journey.createdAt).format('MMM D, YYYY')}</span>
          <span className="font-medium text-[color:var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity">
            Open workspace
          </span>
        </div>
      </article>
    </Link>
  );
}

/**
 * Orientation hub: journeys + open tasks.
 * Primary CTA is Start tracking — paste a scholarship URL/article, save the find,
 * and open an application under a new journey.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, isError, error, refetch } = useJourneys();
  const {
    data: tasksData,
    isLoading: tasksLoading,
    isError: tasksError,
    refetch: refetchTasks,
  } = useTasks();
  const journeys = flattenPages(data?.pages);
  const allTasks = flattenPages(tasksData?.pages);
  const [modalOpen, setModalOpen] = useState(false);

  const openTasks = useMemo(
    () =>
      allTasks
        .filter((t) => t.status !== TaskStatus.DONE && t.status !== TaskStatus.CANCELLED)
        .slice(0, 6),
    [allTasks],
  );

  const stats = useMemo(() => {
    const active = journeys.filter((j) => j.status === JourneyStatus.ACTIVE).length;
    const planning = journeys.filter((j) => j.status === JourneyStatus.PLANNING).length;
    const openCount = allTasks.filter(
      (t) => t.status !== TaskStatus.DONE && t.status !== TaskStatus.CANCELLED,
    ).length;
    return { active, planning, openCount, total: journeys.length };
  }, [journeys, allTasks]);

  const firstName = user?.name?.trim().split(/\s+/)[0];
  const greeting = `${greetingForHour(new Date().getHours())}${firstName ? `, ${firstName}` : ''}`;


  return (
    <div className="app-page-wide space-y-8">
      <PageHeader
        eyebrow="Overview"
        title={greeting}
        description="Start tracking to paste a scholarship link or article, or open an existing journey."
        extra={
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Start tracking
          </Button>
        }
      />

      {isLoading || tasksLoading ? (
        <StatSkeleton />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3 animate-rise-delay-1">
          <div className="surface p-5">
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
              Active journeys
            </p>
            <p
              className="mt-2 mb-0 text-3xl font-semibold text-[color:var(--ink)] tabular-nums"
              style={{ fontFamily: 'var(--font-display), sans-serif' }}
            >
              {stats.active}
            </p>
            <p className="mt-1 mb-0 text-xs text-[color:var(--text-secondary)]">
              {stats.planning} in planning · {stats.total} total
            </p>
          </div>
          <div className="surface p-5">
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
              Open tasks
            </p>
            <p
              className="mt-2 mb-0 text-3xl font-semibold text-[color:var(--ink)] tabular-nums"
              style={{ fontFamily: 'var(--font-display), sans-serif' }}
            >
              {stats.openCount}
            </p>
            <p className="mt-1 mb-0 text-xs text-[color:var(--text-secondary)]">Across every journey</p>
          </div>
          <div className="surface p-5 flex flex-col justify-between">
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
              Quick actions
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/opportunities">
                <Button size="small" icon={<StarOutlined />}>
                  Opportunities
                </Button>
              </Link>
              <Link href="/tasks">
                <Button size="small" icon={<CheckSquareOutlined />}>
                  All tasks
                </Button>
              </Link>
              <Link href="/documents">
                <Button size="small" icon={<FileTextOutlined />}>
                  Documents
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] items-start">
        <section className="animate-rise-delay-2">
          <div className="mb-4">
            <h2 className="m-0 text-lg font-semibold text-[color:var(--ink)]">Journeys</h2>
            <p className="mt-1 mb-0 text-sm text-[color:var(--text-secondary)]">
              Each journey is one goal. Use Start tracking to paste a scholarship link or article when you already found one.
            </p>
          </div>

          {isLoading ? (
            <CardGridSkeleton count={4} />
          ) : isError ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : journeys.length === 0 ? (
            <EmptyState
              title="Start tracking your first goal"
              description="A journey tracks one goal end to end — for example an MSc programme — across every admission and scholarship tied to it."
              action={{ label: 'Start tracking', onClick: () => setModalOpen(true) }}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {journeys.map((journey) => (
                <JourneyCard key={journey.id} journey={journey} />
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4 animate-rise-delay-3 lg:sticky lg:top-24">
          <div className="surface overflow-hidden">
            <div className="px-5 py-4 border-b border-[color:var(--border)] flex items-center justify-between">
              <h2 className="m-0 text-[15px] font-semibold text-[color:var(--ink)]">Needs attention</h2>
              <Link
                href="/tasks"
                className="text-xs font-semibold text-[color:var(--accent)] hover:text-[color:var(--accent-hover)]"
              >
                View all
              </Link>
            </div>
            <div className="p-2">
              {tasksLoading ? (
                <ListSkeleton rows={3} />
              ) : tasksError ? (
                <div className="p-3">
                  <ErrorState error={null} onRetry={() => refetchTasks()} title="Couldn't load tasks" />
                </div>
              ) : openTasks.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="m-0 text-sm font-medium text-[color:var(--ink)]">You&apos;re clear</p>
                  <p className="mt-1 mb-0 text-xs text-[color:var(--text-muted)]">
                    No open tasks across your journeys.
                  </p>
                </div>
              ) : (
                <ul className="m-0 p-0 list-none divide-y divide-[color:var(--border)]">
                  {openTasks.map((task) => (
                    <li key={task.id}>
                      <Link
                        href={
                          task.applicationId
                            ? `/applications/${task.applicationId}`
                            : `/journeys/${task.journeyId}`
                        }
                        className="flex gap-3 px-3 py-3 rounded-xl hover:bg-[color:var(--canvas)] transition-colors no-underline"
                      >
                        <span className="mt-1.5 h-2 w-2 rounded-full bg-[color:var(--accent)] shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-[color:var(--ink)] truncate">
                            {task.title}
                          </span>
                          <span className="mt-0.5 flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
                            <StatusTag value={task.priority} />
                            {task.dueDate && <span>Due {dayjs(task.dueDate).format('MMM D')}</span>}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[14px] border border-[color:var(--border)] bg-[color:var(--ink)] p-5 text-white">
            <div className="absolute inset-0 opacity-40 pointer-events-none grid-fade" />
            <p className="relative m-0 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/80">
              How it fits together
            </p>
            <p className="relative mt-2 mb-4 text-sm leading-relaxed text-white/85">
              Tap Start tracking, name your goal, and paste the scholarship link or article you
              found. We save that find and open an application workspace under your journey.
            </p>
            <div className="relative flex flex-wrap gap-2">
              <Button
                type="primary"
                ghost
                className="!border-white/25 !text-white hover:!bg-white/10"
                onClick={() => setModalOpen(true)}
              >
                Start tracking
              </Button>
              <Link href="/opportunities">
                <Button ghost className="!border-white/25 !text-white hover:!bg-white/10">
                  Your finds
                </Button>
              </Link>
            </div>
          </div>
        </aside>
      </div>

      <StartTrackingModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
