'use client';

import { App, Button, DatePicker, Form, Input, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { StatusTag } from '@/components/StatusTag';
import { RelatedEntityLink } from '@/components/RelatedEntityLink';
import {
  APPLICATION_STATUS_OPTIONS,
  APPLICATION_TYPE_OPTIONS,
  humanizeEnum,
} from '@/lib/labels';
import { ApplicationStatus, ApplicationType } from '@/lib/shared-types';
import { useDeleteApplication, useRestoreApplication, useUpdateApplication } from '@/lib/queries';
import { friendlyApiMessage } from '@/lib/user-errors';
import type { Application } from '@/lib/types';

const RECENTLY_DELETED_KEY = 'scholarshipos.recentlyDeletedApplications';

export type RecentlyDeletedApplication = {
  id: string;
  journeyId: string;
  title: string;
  deletedAt: string;
};

export function stashRecentlyDeleted(entry: RecentlyDeletedApplication) {
  try {
    const raw = sessionStorage.getItem(RECENTLY_DELETED_KEY);
    const list: RecentlyDeletedApplication[] = raw ? JSON.parse(raw) : [];
    const next = [entry, ...list.filter((e) => e.id !== entry.id)].slice(0, 10);
    sessionStorage.setItem(RECENTLY_DELETED_KEY, JSON.stringify(next));
  } catch {
    // sessionStorage may be unavailable — undo toast still works in-memory
  }
}

export function readRecentlyDeleted(journeyId?: string): RecentlyDeletedApplication[] {
  try {
    const raw = sessionStorage.getItem(RECENTLY_DELETED_KEY);
    const list: RecentlyDeletedApplication[] = raw ? JSON.parse(raw) : [];
    return journeyId ? list.filter((e) => e.journeyId === journeyId) : list;
  } catch {
    return [];
  }
}

export function removeRecentlyDeleted(id: string) {
  try {
    const raw = sessionStorage.getItem(RECENTLY_DELETED_KEY);
    const list: RecentlyDeletedApplication[] = raw ? JSON.parse(raw) : [];
    sessionStorage.setItem(
      RECENTLY_DELETED_KEY,
      JSON.stringify(list.filter((e) => e.id !== id)),
    );
  } catch {
    // ignore
  }
}

export function OverviewTab({ application }: { application: Application }) {
  const { message, notification } = App.useApp();
  const router = useRouter();
  const updateApplication = useUpdateApplication(application.journeyId);
  const deleteApplication = useDeleteApplication(application.journeyId);
  const restoreApplication = useRestoreApplication(application.journeyId);
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm();

  const onSave = async (values: {
    title: string;
    applicationType: ApplicationType;
    status: ApplicationStatus;
    portal?: string;
    externalUrl?: string;
    notes?: string;
    startDate?: dayjs.Dayjs | null;
    submissionDate?: dayjs.Dayjs | null;
  }) => {
    try {
      await updateApplication.mutateAsync({
        id: application.id,
        title: values.title,
        applicationType: values.applicationType,
        status: values.status,
        portal: values.portal || null,
        externalUrl: values.externalUrl || null,
        notes: values.notes || null,
        startDate: values.startDate ? values.startDate.format('YYYY-MM-DD') : null,
        submissionDate: values.submissionDate ? values.submissionDate.format('YYYY-MM-DD') : null,
      });
      setEditOpen(false);
      message.success('Application updated');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not update application'));
    }
  };

  const onDelete = async () => {
    const snapshot = {
      id: application.id,
      journeyId: application.journeyId,
      title: application.title,
      deletedAt: new Date().toISOString(),
    };
    try {
      await deleteApplication.mutateAsync(application.id);
      stashRecentlyDeleted(snapshot);

      const key = `restore-${application.id}`;
      notification.success({
        key,
        message: 'Application removed',
        description:
          'It’s hidden from your workspace. You can restore it while it remains in the retention window.',
        duration: 12,
        btn: (
          <Button
            type="primary"
            size="small"
            loading={restoreApplication.isPending}
            onClick={() => {
              void (async () => {
                try {
                  await restoreApplication.mutateAsync(application.id);
                  removeRecentlyDeleted(application.id);
                  notification.destroy(key);
                  message.success('Application restored');
                  router.push(`/applications/${application.id}`);
                } catch (error) {
                  message.error(friendlyApiMessage(error, 'Could not restore application'));
                }
              })();
            }}
          >
            Undo
          </Button>
        ),
      });

      router.push(`/journeys/${application.journeyId}`);
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not delete application'));
    }
  };

  const openEdit = () => {
    form.setFieldsValue({
      ...application,
      startDate: application.startDate ? dayjs(application.startDate) : null,
      submissionDate: application.submissionDate ? dayjs(application.submissionDate) : null,
    });
    setEditOpen(true);
  };

  const detailRows: { label: string; value: ReactNode }[] = [
    { label: 'Status', value: <StatusTag value={application.status} /> },
    {
      label: 'Type',
      value: <span className="capitalize">{humanizeEnum(application.applicationType)}</span>,
    },
    {
      label: 'Linked opportunity',
      value: application.opportunityId ? (
        <Link
          href={`/opportunities/${application.opportunityId}`}
          className="text-[color:var(--accent)] hover:text-[color:var(--accent-hover)]"
        >
          View opportunity
        </Link>
      ) : (
        'None — not started from a catalog opportunity'
      ),
    },
    {
      label: 'Start date',
      value: application.startDate ? dayjs(application.startDate).format('MMM D, YYYY') : '—',
    },
    {
      label: 'Submission date',
      value: application.submissionDate
        ? dayjs(application.submissionDate).format('MMM D, YYYY')
        : '—',
    },
    { label: 'Portal', value: application.portal ?? '—' },
    {
      label: 'External URL',
      value: application.externalUrl ? (
        <a
          href={application.externalUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[color:var(--accent)] hover:text-[color:var(--accent-hover)] break-all"
        >
          {application.externalUrl}
        </a>
      ) : (
        '—'
      ),
    },
    { label: 'Notes', value: application.notes ?? '—' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <RelatedEntityLink href={`/journeys/${application.journeyId}`}>
          ← Back to journey
        </RelatedEntityLink>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={openEdit}>Edit</Button>
          <ConfirmDeleteButton
            title="Remove this application?"
            description="It disappears from your workspace right away. You can restore it later while it’s still within the retention window (before permanent purge)."
            onConfirm={() => void onDelete()}
            loading={deleteApplication.isPending}
          >
            Delete application
          </ConfirmDeleteButton>
        </div>
      </div>

      <section className="rounded-[calc(var(--radius)-4px)] border border-[color:var(--border)] overflow-hidden bg-[color:var(--surface)]">
        <dl className="m-0 divide-y divide-[color:var(--border)]">
          {detailRows.map((row) => (
            <div key={row.label} className="grid sm:grid-cols-[160px_1fr] gap-1 sm:gap-4 px-4 py-3.5">
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--text-muted)] sm:pt-0.5">
                {row.label}
              </dt>
              <dd className="m-0 text-sm text-[color:var(--ink)] leading-relaxed">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Modal
        title="Edit application"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={updateApplication.isPending}
        okText="Save"
        destroyOnHidden
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={onSave} className="!mt-2" requiredMark={false}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="applicationType" label="Type">
            <Select size="large" options={APPLICATION_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="status" label="Status">
            <Select size="large" options={APPLICATION_STATUS_OPTIONS} />
          </Form.Item>
          <div className="grid sm:grid-cols-2 gap-x-3">
            <Form.Item name="startDate" label="Start date">
              <DatePicker className="w-full" size="large" />
            </Form.Item>
            <Form.Item name="submissionDate" label="Submission date">
              <DatePicker className="w-full" size="large" />
            </Form.Item>
          </div>
          <Form.Item name="portal" label="Portal">
            <Input size="large" placeholder="e.g. university admissions portal" />
          </Form.Item>
          <Form.Item
            name="externalUrl"
            label="External URL"
            rules={[{ type: 'url', message: 'Enter a valid URL' }]}
          >
            <Input size="large" placeholder="https://" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
