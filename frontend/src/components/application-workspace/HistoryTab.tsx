'use client';

import { CameraOutlined } from '@ant-design/icons';
import { App, Button, Drawer, Form, Input, Modal, Tag } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ListSkeleton } from '@/components/LoadingSkeleton';
import {
  useApplicationSnapshot,
  useApplicationSnapshots,
  useCreateSnapshot,
  useDeleteSnapshot,
  useEditSnapshot,
} from '@/lib/queries';
import { friendlyApiMessage } from '@/lib/user-errors';

/**
 * Snapshots are append-only historical records. Editing creates a new revision
 * (previous row unchanged). Explicit delete is allowed.
 */
export function HistoryTab({ applicationId }: { applicationId: string }) {
  const { message } = App.useApp();
  const { data: snapshots, isLoading, isError, error, refetch } = useApplicationSnapshots(applicationId);
  const create = useCreateSnapshot(applicationId);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const onCreate = async (values: { label?: string }) => {
    try {
      await create.mutateAsync(values);
      setModalOpen(false);
      form.resetFields();
      message.success('Snapshot captured');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not create snapshot'));
    }
  };

  if (isLoading) return <ListSkeleton />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<CameraOutlined />} onClick={() => setModalOpen(true)}>
          Capture snapshot
        </Button>
      </div>

      {!snapshots || snapshots.length === 0 ? (
        <EmptyState
          title="No snapshots yet"
          description="A snapshot freezes this application's state — profile, documents, requirements — as a historical record. Editing later creates a new revision; the previous one stays intact."
          action={{ label: 'Capture a snapshot', onClick: () => setModalOpen(true) }}
        />
      ) : (
        <div className="space-y-2">
          {snapshots.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setViewingId(s.id)}
              className="surface-interactive w-full text-left flex items-center justify-between gap-3 p-3.5 cursor-pointer"
            >
              <div className="min-w-0">
                <p
                  className="m-0 text-sm font-semibold text-[color:var(--ink)]"
                  style={{ fontFamily: 'var(--font-display), sans-serif' }}
                >
                  {s.label ?? 'Untitled snapshot'}
                </p>
                <p className="mt-0.5 mb-0 text-sm text-[color:var(--text-muted)]">
                  {dayjs(s.createdAt).format('MMM D, YYYY, h:mm A')}
                  {s.supersedesSnapshotId ? ' · revision' : ''}
                </p>
              </div>
              <Tag className="!m-0 shrink-0">
                {s.supersedesSnapshotId ? 'revision' : 'historical record'}
              </Tag>
            </button>
          ))}
        </div>
      )}

      <Modal
        title="Capture snapshot"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={create.isPending}
        okText="Capture"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={onCreate} className="!mt-2">
          <Form.Item name="label" label="Label (optional)">
            <Input placeholder="e.g. Before submission" autoFocus size="large" />
          </Form.Item>
        </Form>
      </Modal>

      <SnapshotDrawer
        applicationId={applicationId}
        snapshotId={viewingId}
        onClose={() => setViewingId(null)}
        onOpenRevision={(id) => setViewingId(id)}
      />
    </div>
  );
}

function SnapshotDrawer({
  applicationId,
  snapshotId,
  onClose,
  onOpenRevision,
}: {
  applicationId: string;
  snapshotId: string | null;
  onClose: () => void;
  onOpenRevision: (id: string) => void;
}) {
  const { message } = App.useApp();
  const { data: snapshot, isLoading } = useApplicationSnapshot(applicationId, snapshotId ?? '');
  const edit = useEditSnapshot(applicationId);
  const remove = useDeleteSnapshot(applicationId);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameForm] = Form.useForm();

  const onRename = async (values: { label?: string }) => {
    if (!snapshotId) return;
    try {
      const revision = await edit.mutateAsync({
        snapshotId,
        label: values.label?.trim() || null,
      });
      setRenameOpen(false);
      renameForm.resetFields();
      message.success('New revision created — previous snapshot unchanged');
      onOpenRevision(revision.id);
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not create revision'));
    }
  };

  const onDelete = async () => {
    if (!snapshotId) return;
    try {
      await remove.mutateAsync(snapshotId);
      message.success('Snapshot deleted');
      onClose();
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not delete snapshot'));
    }
  };

  return (
    <>
      <Drawer
        title={snapshot?.label ?? 'Snapshot'}
        open={Boolean(snapshotId)}
        onClose={onClose}
        width={480}
        extra={
          snapshot ? (
            <div className="flex gap-2">
              <Button
                size="small"
                onClick={() => {
                  renameForm.setFieldsValue({ label: snapshot.label ?? undefined });
                  setRenameOpen(true);
                }}
              >
                New revision
              </Button>
              <ConfirmDeleteButton
                size="small"
                title="Delete this snapshot?"
                description="This removes only this record. Other revisions stay. There is no requirement to keep at least one snapshot."
                onConfirm={() => void onDelete()}
                loading={remove.isPending}
              />
            </div>
          ) : null
        }
      >
        {isLoading ? (
          <ListSkeleton />
        ) : snapshot ? (
          <div className="space-y-4">
            <p className="m-0 text-sm text-[color:var(--text-secondary)] leading-relaxed">
              Captured {dayjs(snapshot.createdAt).format('MMM D, YYYY, h:mm A')}. This row never
              changes in place — edits create a new revision.
            </p>
            {snapshot.supersedesSnapshotId && (
              <p className="m-0 text-xs text-[color:var(--text-muted)]">
                Supersedes snapshot{' '}
                <button
                  type="button"
                  className="text-[color:var(--accent)] underline cursor-pointer border-none bg-transparent p-0"
                  onClick={() => onOpenRevision(snapshot.supersedesSnapshotId!)}
                >
                  {snapshot.supersedesSnapshotId.slice(0, 8)}…
                </button>
              </p>
            )}
            <pre className="text-xs whitespace-pre-wrap m-0 p-4 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--canvas)] text-[color:var(--ink)] overflow-auto">
              {JSON.stringify(snapshot.data, null, 2)}
            </pre>
          </div>
        ) : null}
      </Drawer>

      <Modal
        title="Create revision"
        open={renameOpen}
        onCancel={() => setRenameOpen(false)}
        onOk={() => renameForm.submit()}
        confirmLoading={edit.isPending}
        okText="Create revision"
        destroyOnHidden
      >
        <p className="mt-0 mb-3 text-sm text-[color:var(--text-secondary)] leading-relaxed">
          A new snapshot row is created with this label. The previous snapshot stays unchanged.
        </p>
        <Form form={renameForm} layout="vertical" onFinish={onRename}>
          <Form.Item name="label" label="Label">
            <Input size="large" placeholder="e.g. After document update" autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
