'use client';

import { PlusOutlined } from '@ant-design/icons';
import { App, Button, Checkbox, DatePicker, Form, Input, Modal, Select, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ListSkeleton } from '@/components/LoadingSkeleton';
import { StatusTag } from '@/components/StatusTag';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import {
  TASK_DEPENDENCY_OPTIONS,
  TASK_PRIORITY_OPTIONS,
  humanizeEnum,
} from '@/lib/labels';
import { TaskDependencyType, TaskPriority, TaskStatus } from '@/lib/shared-types';
import { flattenPages, useCreateTask, useDeleteTask, useTasks, useUpdateTask } from '@/lib/queries';
import { friendlyApiMessage } from '@/lib/user-errors';

/**
 * `dependsOnTaskId`/`dependencyType` are shown as a small informational note
 * only ("depends on: X (soft)") — never as a disabled checkbox or a blocked
 * state. The backend never enforces this as a blocker, so the UI must not
 * invent one either (see docs/decisions.md, "Dependencies never block the user").
 */
export function TasksTab({ journeyId, applicationId }: { journeyId: string; applicationId: string }) {
  const { message } = App.useApp();
  const { data, isLoading, isError, error, refetch } = useTasks({ journeyId, applicationId });
  const tasks = flattenPages(data?.pages);
  const create = useCreateTask(journeyId);
  const update = useUpdateTask(journeyId);
  const remove = useDeleteTask(journeyId);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const dependsOnTaskId = Form.useWatch('dependsOnTaskId', form);

  const taskTitleById = new Map(tasks.map((t) => [t.id, t.title]));

  const onCreate = async (values: {
    title: string;
    description?: string;
    priority?: string;
    dueDate?: dayjs.Dayjs;
    dependsOnTaskId?: string;
    dependencyType?: TaskDependencyType;
  }) => {
    try {
      await create.mutateAsync({
        title: values.title,
        description: values.description || undefined,
        priority: values.priority,
        dueDate: values.dueDate?.format('YYYY-MM-DD'),
        applicationId,
        dependsOnTaskId: values.dependsOnTaskId,
        dependencyType: values.dependsOnTaskId ? values.dependencyType : undefined,
      });
      setModalOpen(false);
      form.resetFields();
      message.success('Task created');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not create task'));
    }
  };

  const toggleTask = async (taskId: string, currentStatus: string) => {
    const nextStatus = currentStatus === TaskStatus.DONE ? TaskStatus.TODO : TaskStatus.DONE;
    try {
      await update.mutateAsync({ id: taskId, status: nextStatus });
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not update task'));
    }
  };

  if (isLoading) return <ListSkeleton />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Add task
        </Button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks yet for this application"
          description="Break the application down into concrete steps — e.g. 'request transcript', 'draft SOP'."
          action={{ label: 'Add a task', onClick: () => setModalOpen(true) }}
        />
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <article
              key={task.id}
              className="flex items-center justify-between gap-3 rounded-[calc(var(--radius)-4px)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3.5"
            >
              <label className="flex items-start gap-3 min-w-0 cursor-pointer">
                <Checkbox
                  className="mt-0.5"
                  checked={task.status === TaskStatus.DONE}
                  onChange={() => void toggleTask(task.id, task.status)}
                />
                <span className="min-w-0">
                  <span
                    className={`block text-sm font-medium ${
                      task.status === TaskStatus.DONE
                        ? 'line-through text-[color:var(--text-muted)]'
                        : 'text-[color:var(--ink)]'
                    }`}
                  >
                    {task.title}
                  </span>
                  {task.description && (
                    <span className="mt-0.5 block text-xs text-[color:var(--text-secondary)] line-clamp-2">
                      {task.description}
                    </span>
                  )}
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[color:var(--text-muted)]">
                    {task.dueDate && <span>due {dayjs(task.dueDate).format('MMM D, YYYY')}</span>}
                    {task.dependsOnTaskId && (
                      <Tooltip title="Informational only — this never blocks completing the task">
                        <span>
                          depends on: {taskTitleById.get(task.dependsOnTaskId) ?? 'another task'}
                          {task.dependencyType ? ` (${humanizeEnum(task.dependencyType)})` : ''}
                        </span>
                      </Tooltip>
                    )}
                  </span>
                </span>
              </label>
              <div className="flex items-center gap-2 shrink-0">
                <StatusTag value={task.priority} />
                <ConfirmDeleteButton size="small" title="Delete this task?" onConfirm={() => remove.mutate(task.id)} loading={remove.isPending} />
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        title="New task"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={create.isPending}
        okText="Create"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={onCreate} className="!mt-2" requiredMark={false}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input autoFocus size="large" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional details" />
          </Form.Item>
          <Form.Item name="priority" label="Priority" initialValue={TaskPriority.MEDIUM}>
            <Select size="large" options={TASK_PRIORITY_OPTIONS} />
          </Form.Item>
          <Form.Item name="dueDate" label="Due date">
            <DatePicker className="w-full" size="large" />
          </Form.Item>
          {tasks.length > 0 && (
            <>
              <Form.Item name="dependsOnTaskId" label="Depends on (informational only)">
                <Select allowClear size="large" options={tasks.map((t) => ({ value: t.id, label: t.title }))} />
              </Form.Item>
              {dependsOnTaskId ? (
                <Form.Item
                  name="dependencyType"
                  label="Dependency type"
                  initialValue={TaskDependencyType.SOFT}
                  extra="Informational only — never blocks you from completing the task"
                >
                  <Select size="large" options={TASK_DEPENDENCY_OPTIONS} />
                </Form.Item>
              ) : null}
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}
