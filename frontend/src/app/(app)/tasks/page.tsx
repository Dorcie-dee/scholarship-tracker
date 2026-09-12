'use client';

import { PlusOutlined } from '@ant-design/icons';
import { App, Button, Checkbox, DatePicker, Form, Input, Modal, Segmented, Select } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';
import { CursorPager } from '@/components/CursorPager';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ListSkeleton } from '@/components/LoadingSkeleton';
import { PageHeader } from '@/components/PageHeader';
import { RelatedEntityLink } from '@/components/RelatedEntityLink';
import { StatusTag } from '@/components/StatusTag';
import { TASK_PRIORITY_OPTIONS } from '@/lib/labels';
import { TaskPriority, TaskStatus } from '@/lib/shared-types';
import {
  flattenPages,
  useCreateTask,
  useJourneys,
  useTasks,
  useUpdateTask,
} from '@/lib/queries';
import { friendlyApiMessage } from '@/lib/user-errors';

export default function TasksPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const selectedJourneyId = (Form.useWatch('journeyId', form) as string | undefined) ?? '';
  const { data, isLoading, isError, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } = useTasks();
  const { data: journeysData } = useJourneys();
  const journeys = flattenPages(journeysData?.pages);
  const allTasks = flattenPages(data?.pages);
  const tasks =
    filter === 'open'
      ? allTasks.filter((t) => t.status !== TaskStatus.DONE && t.status !== TaskStatus.CANCELLED)
      : allTasks;
  const updateTask = useUpdateTask('');
  const createTask = useCreateTask(selectedJourneyId);

  const toggleTask = async (taskId: string, journeyId: string, currentStatus: string) => {
    void journeyId;
    const nextStatus = currentStatus === TaskStatus.DONE ? TaskStatus.TODO : TaskStatus.DONE;
    try {
      await updateTask.mutateAsync({ id: taskId, status: nextStatus as never });
      refetch();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not update task');
    }
  };

  const onCreate = async (values: {
    title: string;
    journeyId: string;
    priority?: string;
    dueDate?: dayjs.Dayjs;
  }) => {
    try {
      await createTask.mutateAsync({
        title: values.title,
        priority: values.priority,
        dueDate: values.dueDate?.format('YYYY-MM-DD'),
      });
      setCreateOpen(false);
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      message.success('Task created');
    } catch (err) {
      message.error(friendlyApiMessage(err, 'Could not create task'));
    }
  };

  return (
    <div className="app-page-narrow space-y-5">
      <PageHeader
        eyebrow="Across journeys"
        title="Tasks"
        description="Everything you need to do, across every application journey."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Add task
          </Button>
        }
      />

      <Segmented
        value={filter}
        onChange={(v) => setFilter(v as 'open' | 'all')}
        options={[
          { label: 'Open', value: 'open' },
          { label: 'All', value: 'all' },
        ]}
      />

      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : tasks.length === 0 ? (
        <EmptyState
          title={filter === 'open' ? 'Nothing open right now' : 'No tasks yet'}
          description={
            filter === 'open'
              ? 'Every task is either done or cancelled. Switch to "All" to see the full history.'
              : 'Use Add task above, or create tasks from inside a journey or an application workspace.'
          }
        />
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="surface flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4"
            >
              <div className="flex items-start gap-3 min-w-0">
                <Checkbox
                  className="!mt-1"
                  checked={task.status === TaskStatus.DONE}
                  onChange={() => void toggleTask(task.id, task.journeyId, task.status)}
                  aria-label={`Mark ${task.title} as ${task.status === TaskStatus.DONE ? 'todo' : 'done'}`}
                />
                <div className="min-w-0">
                  <p
                    className={`m-0 text-sm font-medium ${
                      task.status === TaskStatus.DONE
                        ? 'line-through text-[color:var(--text-muted)]'
                        : 'text-[color:var(--ink)]'
                    }`}
                  >
                    {task.title}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[color:var(--text-muted)]">
                    {task.dueDate && <span>Due {dayjs(task.dueDate).format('MMM D, YYYY')}</span>}
                    <RelatedEntityLink
                      href={
                        task.applicationId
                          ? `/applications/${task.applicationId}`
                          : `/journeys/${task.journeyId}`
                      }
                    >
                      {task.applicationId ? 'View application' : 'View journey'}
                    </RelatedEntityLink>
                  </div>
                </div>
              </div>
              <StatusTag value={task.priority} />
            </div>
          ))}
        </div>
      )}

      <CursorPager
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
      />

      <Modal
        title="Add task"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createTask.isPending}
        okText="Create"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={onCreate} className="!mt-2" requiredMark={false}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input autoFocus size="large" />
          </Form.Item>
          <Form.Item name="journeyId" label="Journey" rules={[{ required: true, message: 'Choose a journey' }]}>
            <Select
              size="large"
              placeholder="Choose a journey"
              showSearch
              optionFilterProp="label"
              options={journeys.map((j) => ({ value: j.id, label: j.title }))}
            />
          </Form.Item>
          <Form.Item name="priority" label="Priority" initialValue={TaskPriority.MEDIUM}>
            <Select size="large" options={TASK_PRIORITY_OPTIONS} />
          </Form.Item>
          <Form.Item name="dueDate" label="Due date">
            <DatePicker className="w-full" size="large" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
