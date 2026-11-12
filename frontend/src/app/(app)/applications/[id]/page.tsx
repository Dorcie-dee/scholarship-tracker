'use client';

import { Button, Skeleton, Tabs } from 'antd';
import Link from 'next/link';
import { use } from 'react';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { StatusTag } from '@/components/StatusTag';
import { DeadlinesTab } from '@/components/application-workspace/DeadlinesTab';
import { DocumentsTab } from '@/components/application-workspace/DocumentsTab';
import { HistoryTab } from '@/components/application-workspace/HistoryTab';
import { OverviewTab } from '@/components/application-workspace/OverviewTab';
import { RequirementsTab } from '@/components/application-workspace/RequirementsTab';
import { TasksTab } from '@/components/application-workspace/TasksTab';
import { useApplication } from '@/lib/queries';
import { ApiError } from '@/lib/api-client';

/**
 * The Application workspace — treated as one connected place to work, not a
 * CRUD form. A soft-deleted (or otherwise nonexistent) Application 404s here
 * exactly like a genuinely unknown id — see Track 2 §0: this route never
 * distinguishes "deleted" from "never existed", which is the whole point.
 */
export default function ApplicationWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: application, isLoading, isError, error } = useApplication(id);

  if (isLoading) {
    return <Skeleton active />;
  }

  if (isError || !application) {
    const notFound = error instanceof ApiError && error.status === 404;
    return notFound ? (
      <div className="app-page py-16 text-center animate-rise">
        <div className="surface inline-block px-10 py-12 max-w-md">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--accent)]">
            Workspace
          </p>
          <h1
            className="mt-2 mb-0 text-2xl font-semibold text-[color:var(--ink)]"
            style={{ fontFamily: 'var(--font-display), sans-serif' }}
          >
            Application not found
          </h1>
          <p className="mt-2 mb-6 text-[15px] text-[color:var(--text-secondary)] leading-relaxed">
            It may have been deleted, or the link may be incorrect.
          </p>
          <Link href="/dashboard">
            <Button type="primary">Back to dashboard</Button>
          </Link>
        </div>
      </div>
    ) : (
      <ErrorState error={error} title="Couldn't load this application" />
    );
  }

  return (
    <div className="app-page space-y-5">
      <PageHeader
        backHref={`/journeys/${application.journeyId}`}
        backLabel="Back to journey"
        eyebrow="Workspace"
        title={application.title}
        description="Requirements, tasks, deadlines, documents, and history for this application."
        extra={<StatusTag value={application.status} />}
      />

      <div className="surface overflow-hidden animate-rise">
        <Tabs
          defaultActiveKey="overview"
          className="application-workspace-tabs [&_.ant-tabs-nav]:!mb-0 [&_.ant-tabs-nav]:px-4 [&_.ant-tabs-nav]:pt-2 [&_.ant-tabs-nav]:bg-[color:var(--canvas)] [&_.ant-tabs-tab]:!py-3 [&_.ant-tabs-content-holder]:p-4 sm:[&_.ant-tabs-content-holder]:p-5"
          items={[
            { key: 'overview', label: 'Overview', children: <OverviewTab application={application} /> },
            {
              key: 'requirements',
              label: 'Requirements',
              children: <RequirementsTab applicationId={application.id} />,
            },
            {
              key: 'tasks',
              label: 'Tasks',
              children: <TasksTab journeyId={application.journeyId} applicationId={application.id} />,
            },
            {
              key: 'deadlines',
              label: 'Deadlines',
              children: <DeadlinesTab applicationId={application.id} />,
            },
            {
              key: 'documents',
              label: 'Documents',
              children: <DocumentsTab applicationId={application.id} />,
            },
            { key: 'history', label: 'History', children: <HistoryTab applicationId={application.id} /> },
          ]}
        />
      </div>
    </div>
  );
}
