'use client';

import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, DatePicker, Form, Input, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ListSkeleton } from '@/components/LoadingSkeleton';
import { StatusTag } from '@/components/StatusTag';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { DEADLINE_TYPE_OPTIONS, enumOptions, humanizeEnum } from '@/lib/labels';
import { DeadlineStatus, DeadlineType } from '@/lib/shared-types';
import {
  flattenPages,
  useCreateDeadline,
  useDeadlines,
  useDeleteDeadline,
  useUpdateDeadline,
} from '@/lib/queries';
import { friendlyApiMessage } from '@/lib/user-errors';
import type { Deadline } from '@/lib/types';

const DEADLINE_STATUS_OPTIONS = enumOptions(Object.values(DeadlineStatus));

/** Grouped simply into Upcoming / Past — no calendar widget, which the spec explicitly says isn't justified for this volume of dates. */
export function DeadlinesTab({ applicationId }: { applicationId: string }) {
  const { message } = App.useApp();
  const { data, isLoading, isError, error, refetch } = useDeadlines({ applicationId });
  const deadlines = flattenPages(data?.pages).sort((a, b) => a.date.localeCompare(b.date));
  const create = useCreateDeadline();
  const update = useUpdateDeadline();
  const remove = useDeleteDeadline();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Deadline | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const now = dayjs();
  const upcoming = deadlines.filter((d) => dayjs(d.date).isAfter(now));
  const past = deadlines.filter((d) => !dayjs(d.date).isAfter(now));

  const onCreate = async (values: {
    label: string;
    deadlineType: DeadlineType;
    date: dayjs.Dayjs;
    status?: DeadlineStatus;
    notes?: string;
  }) => {
    try {
      await create.mutateAsync({
        label: values.label,
        deadlineType: values.deadlineType,
        date: values.date.toISOString(),
        status: values.status,
        notes: values.notes || undefined,
        applicationId,
      });
      setCreateOpen(false);
      createForm.resetFields();
      message.success('Deadline added');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not add deadline'));
    }
  };

  const onEdit = async (values: {
    label: string;
    deadlineType: DeadlineType;
    date: dayjs.Dayjs;
    status: DeadlineStatus;
    notes?: string;
  }) => {
    if (!editing) return;
    try {
      await update.mutateAsync({
        id: editing.id,
        label: values.label,
        deadlineType: values.deadlineType,
        date: values.date.toISOString(),
        status: values.status,
        notes: values.notes || null,
      });
      setEditing(null);
      message.success('Deadline updated');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not update deadline'));
    }
  };

  const openEdit = (d: Deadline) => {
    editForm.setFieldsValue({
      label: d.label,
      deadlineType: d.deadlineType,
      date: dayjs(d.date),
      status: d.status,
      notes: d.notes ?? undefined,
    });
    setEditing(d);
  };

  if (isLoading) return <ListSkeleton />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  const renderGroup = (title: string, items: typeof deadlines) => (
    <div>
      <h3 className="m-0 text-xs font-semibold uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
        {title}
      </h3>
      <div className="space-y-2 mt-3">
        {items.map((d) => (
          <article
            key={d.id}
            className="flex items-center justify-between gap-3 rounded-[calc(var(--radius)-4px)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3.5"
          >
            <div className="min-w-0">
              <p
                className="m-0 text-sm font-semibold text-[color:var(--ink)]"
                style={{ fontFamily: 'var(--font-display), sans-serif' }}
              >
                {d.label}
              </p>
              <p className="mt-0.5 mb-0 text-sm text-[color:var(--text-muted)] capitalize">
                {humanizeEnum(d.deadlineType)} — {dayjs(d.date).format('MMM D, YYYY')}
                {d.notes ? ` · ${d.notes}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusTag value={d.status} />
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEdit(d)}
                aria-label={`Edit ${d.label}`}
              />
              <ConfirmDeleteButton
                size="small"
                title="Remove this deadline?"
                onConfirm={() => remove.mutate(d.id)}
                loading={remove.isPending}
              />
            </div>
          </article>
        ))}
      </div>
    </div>
  );

  const deadlineFormFields = (
    <>
      <Form.Item name="label" label="Label" rules={[{ required: true }]}>
        <Input autoFocus size="large" />
      </Form.Item>
      <Form.Item name="deadlineType" label="Type" initialValue={DeadlineType.OTHER} rules={[{ required: true }]}>
        <Select size="large" options={DEADLINE_TYPE_OPTIONS} />
      </Form.Item>
      <Form.Item name="date" label="Date" rules={[{ required: true }]}>
        <DatePicker className="w-full" showTime size="large" />
      </Form.Item>
      <Form.Item name="status" label="Status" initialValue={DeadlineStatus.UPCOMING}>
        <Select size="large" options={DEADLINE_STATUS_OPTIONS} />
      </Form.Item>
      <Form.Item name="notes" label="Notes">
        <Input.TextArea rows={2} />
      </Form.Item>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Add deadline
        </Button>
      </div>

      {deadlines.length === 0 ? (
        <EmptyState
          title="No deadlines recorded yet"
          description="Add key dates — submission deadlines, interview dates, expected decisions — to keep track of this application's timeline."
          action={{ label: 'Add a deadline', onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && renderGroup('Upcoming', upcoming)}
          {past.length > 0 && renderGroup('Past', past)}
        </div>
      )}

      <Modal
        title="Add deadline"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={create.isPending}
        okText="Add"
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={onCreate} className="!mt-2" requiredMark={false}>
          {deadlineFormFields}
        </Form>
      </Modal>

      <Modal
        title="Edit deadline"
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onOk={() => editForm.submit()}
        confirmLoading={update.isPending}
        okText="Save"
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={onEdit} className="!mt-2" requiredMark={false}>
          {deadlineFormFields}
        </Form>
      </Modal>
    </div>
  );
}
