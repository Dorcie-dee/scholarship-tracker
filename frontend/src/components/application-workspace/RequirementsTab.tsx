'use client';

import { EditOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Modal, Select, Tag } from 'antd';
import { useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ListSkeleton } from '@/components/LoadingSkeleton';
import { StatusTag } from '@/components/StatusTag';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import {
  REQUIREMENT_STATUS_OPTIONS,
  REQUIREMENT_TYPE_OPTIONS,
  humanizeEnum,
} from '@/lib/labels';
import { RequirementStatus, RequirementType } from '@/lib/shared-types';
import {
  flattenPages,
  useCreateRequirement,
  useDeleteRequirement,
  useRequirementAiSuggestion,
  useRequirements,
  useUpdateRequirement,
} from '@/lib/queries';
import { friendlyApiMessage } from '@/lib/user-errors';
import type { Requirement } from '@/lib/types';

/**
 * Requirements track what an application needs. AI may suggest a status;
 * the user confirms or rejects — authoritative status never changes silently.
 */
export function RequirementsTab({ applicationId }: { applicationId: string }) {
  const { message } = App.useApp();
  const { data, isLoading, isError, error, refetch } = useRequirements({ applicationId });
  const requirements = flattenPages(data?.pages);
  const create = useCreateRequirement();
  const update = useUpdateRequirement({ applicationId });
  const remove = useDeleteRequirement({ applicationId });
  const ai = useRequirementAiSuggestion({ applicationId });
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Requirement | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const onCreate = async (values: {
    requirementType: RequirementType;
    description: string;
    notes?: string;
    status?: RequirementStatus;
  }) => {
    try {
      await create.mutateAsync({
        requirementType: values.requirementType,
        description: values.description,
        notes: values.notes || undefined,
        status: values.status,
        applicationId,
      });
      setCreateOpen(false);
      createForm.resetFields();
      message.success('Requirement added');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not add requirement'));
    }
  };

  const onEdit = async (values: {
    requirementType: RequirementType;
    description: string;
    notes?: string;
    status: RequirementStatus;
  }) => {
    if (!editing) return;
    try {
      await update.mutateAsync({
        id: editing.id,
        requirementType: values.requirementType,
        description: values.description,
        notes: values.notes || null,
        status: values.status,
      });
      setEditing(null);
      message.success('Requirement updated');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not update requirement'));
    }
  };

  const openEdit = (req: Requirement) => {
    editForm.setFieldsValue({
      requirementType: req.requirementType,
      description: req.description,
      notes: req.notes ?? undefined,
      status: req.status,
    });
    setEditing(req);
  };

  const cycleStatus = async (id: string, current: string) => {
    const next = current === 'confirmed' ? 'needs_verification' : 'confirmed';
    try {
      await update.mutateAsync({ id, status: next as never });
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not update requirement'));
    }
  };

  const onSuggest = async (req: Requirement) => {
    try {
      await ai.suggest.mutateAsync(req.id);
      message.success('Suggestion ready — review and confirm or reject');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not get an AI suggestion'));
    }
  };

  const onConfirmSuggestion = async (req: Requirement) => {
    try {
      await ai.confirm.mutateAsync(req.id);
      message.success('Suggestion applied to status');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not confirm suggestion'));
    }
  };

  const onRejectSuggestion = async (req: Requirement) => {
    try {
      await ai.reject.mutateAsync(req.id);
      message.success('Suggestion dismissed');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not reject suggestion'));
    }
  };

  if (isLoading) return <ListSkeleton />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Add requirement
        </Button>
      </div>

      {requirements.length === 0 ? (
        <EmptyState
          title="No requirements recorded yet"
          description="Requirements are informational — recording them here just keeps track of what this application needs, they never block anything in this app."
          action={{ label: 'Add a requirement', onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="space-y-2">
          {requirements.map((req) => (
            <article
              key={req.id}
              className="rounded-[calc(var(--radius)-4px)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3.5 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5 min-w-0">
                  <p
                    className="m-0 text-sm font-semibold text-[color:var(--ink)] leading-snug"
                    style={{ fontFamily: 'var(--font-display), sans-serif' }}
                  >
                    {req.description}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-[color:var(--text-muted)] flex-wrap">
                    <span className="capitalize">{humanizeEnum(req.requirementType)}</span>
                    {req.notes && <span className="truncate">· {req.notes}</span>}
                    {req.copiedFromRequirementId && <Tag className="!m-0">from opportunity</Tag>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void cycleStatus(req.id, req.status)}
                    className="cursor-pointer border-none bg-transparent p-0"
                    aria-label={`Change status for ${req.description}`}
                  >
                    <StatusTag value={req.status} />
                  </button>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openEdit(req)}
                    aria-label={`Edit ${req.description}`}
                  />
                  <ConfirmDeleteButton
                    size="small"
                    title="Remove this requirement?"
                    onConfirm={() => remove.mutate(req.id)}
                    loading={remove.isPending}
                  />
                </div>
              </div>

              {req.suggestedStatus ? (
                <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--canvas)] px-3.5 py-3 space-y-2">
                  <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
                    Pending AI suggestion
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusTag value={req.suggestedStatus} />
                    {req.suggestionSource && (
                      <span className="text-xs text-[color:var(--text-muted)] capitalize">
                        via {humanizeEnum(req.suggestionSource)}
                      </span>
                    )}
                  </div>
                  {req.suggestionRationale && (
                    <p className="m-0 text-sm text-[color:var(--ink)] leading-relaxed">
                      {req.suggestionRationale}
                    </p>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => void onConfirmSuggestion(req)}
                      loading={ai.confirm.isPending}
                    >
                      Confirm suggestion
                    </Button>
                    <Button
                      size="small"
                      onClick={() => void onRejectSuggestion(req)}
                      loading={ai.reject.isPending}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="small"
                  icon={<ThunderboltOutlined />}
                  onClick={() => void onSuggest(req)}
                  loading={ai.suggest.isPending}
                  disabled={
                    req.status === RequirementStatus.CONFIRMED ||
                    req.status === RequirementStatus.NOT_MET ||
                    req.status === RequirementStatus.NOT_APPLICABLE
                  }
                >
                  Get AI suggestion
                </Button>
              )}
            </article>
          ))}
        </div>
      )}

      <Modal
        title="Add requirement"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={create.isPending}
        okText="Add"
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={onCreate} className="!mt-2" requiredMark={false}>
          <Form.Item name="requirementType" label="Type" initialValue={RequirementType.OTHER} rules={[{ required: true }]}>
            <Select size="large" options={REQUIREMENT_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}>
            <Input.TextArea rows={2} autoFocus />
          </Form.Item>
          <Form.Item name="status" label="Initial status" initialValue={RequirementStatus.UNKNOWN}>
            <Select size="large" options={REQUIREMENT_STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit requirement"
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onOk={() => editForm.submit()}
        confirmLoading={update.isPending}
        okText="Save"
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={onEdit} className="!mt-2" requiredMark={false}>
          <Form.Item name="requirementType" label="Type" rules={[{ required: true }]}>
            <Select size="large" options={REQUIREMENT_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select size="large" options={REQUIREMENT_STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
