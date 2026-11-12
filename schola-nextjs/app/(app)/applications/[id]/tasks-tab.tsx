'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, friendlyErrorMessage } from '@/lib/api-client';
import { formatDate, relativeDays, taskPriorityMeta, taskStatusMeta } from '@/lib/status';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckToggle } from '@/components/ui/check-toggle';
import { Pill } from '@/components/ui/pill';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { FieldError, Input, Label, Textarea } from '@/components/ui/form';
import { cn } from '@/lib/cn';
import { PencilIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { TASK_PRIORITY_VALUES, TASK_STATUS_VALUES, type Task } from './types';
import { RowActions, Spinner, TabEmpty, TabError, iconButtonClass } from './tab-support';

const SELECT_CLASS =
  'h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

interface TaskFormValues {
  title: string;
  description: string;
  status: string;
  priority: string;
  dueDate: string;
}

const EMPTY_FORM: TaskFormValues = { title: '', description: '', status: 'todo', priority: 'medium', dueDate: '' };

function TaskForm({
  initial,
  showStatus,
  submitLabel,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  initial: TaskFormValues;
  showStatus: boolean;
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: TaskFormValues) => void;
}) {
  const [values, setValues] = useState(initial);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
      className="flex flex-col gap-3 rounded-lg border border-line bg-paper p-4"
    >
      <div>
        <Label htmlFor="task-title">Title</Label>
        <Input
          id="task-title"
          required
          maxLength={255}
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          placeholder="e.g. Request transcript from registrar"
        />
      </div>
      <div>
        <Label htmlFor="task-description">Description (optional)</Label>
        <Textarea
          id="task-description"
          value={values.description}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        />
      </div>
      <div className={cn('grid gap-3', showStatus ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        {showStatus && (
          <div>
            <Label htmlFor="task-status">Status</Label>
            <select
              id="task-status"
              className={`${SELECT_CLASS} w-full`}
              value={values.status}
              onChange={(e) => setValues((v) => ({ ...v, status: e.target.value }))}
            >
              {TASK_STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {taskStatusMeta(s).label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <Label htmlFor="task-priority">Priority</Label>
          <select
            id="task-priority"
            className={`${SELECT_CLASS} w-full`}
            value={values.priority}
            onChange={(e) => setValues((v) => ({ ...v, priority: e.target.value }))}
          >
            {TASK_PRIORITY_VALUES.map((p) => (
              <option key={p} value={p}>
                {taskPriorityMeta(p).label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="task-due">Due date</Label>
          <Input
            id="task-due"
            type="date"
            value={values.dueDate}
            onChange={(e) => setValues((v) => ({ ...v, dueDate: e.target.value }))}
          />
        </div>
      </div>
      <FieldError>{error}</FieldError>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !values.title.trim()}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function TaskRow({ applicationId, task }: { applicationId: string; task: Task }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const key = ['tasks', applicationId];

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: key });
  }

  const update = useMutation({
    mutationFn: (values: TaskFormValues) =>
      apiFetch(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: {
          title: values.title.trim(),
          description: values.description.trim() || undefined,
          status: values.status,
          priority: values.priority,
          dueDate: values.dueDate || undefined,
        },
      }),
    onSuccess: async () => {
      setEditing(false);
      await invalidate();
    },
  });

  const toggleDone = useMutation({
    mutationFn: () => apiFetch(`/tasks/${task.id}`, { method: 'PATCH', body: { status: task.status === 'done' ? 'todo' : 'done' } }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: () => apiFetch(`/tasks/${task.id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  if (editing) {
    return (
      <TaskForm
        initial={{
          title: task.title,
          description: task.description ?? '',
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate ?? '',
        }}
        showStatus
        submitLabel="Save changes"
        busy={update.isPending}
        error={update.isError ? friendlyErrorMessage(update.error) : null}
        onCancel={() => setEditing(false)}
        onSubmit={(values) => update.mutate(values)}
      />
    );
  }

  const done = task.status === 'done';
  const priorityMeta = taskPriorityMeta(task.priority);
  const statusMeta = taskStatusMeta(task.status);

  return (
    <Card className="flex items-start gap-3 p-4">
      <CheckToggle
        checked={done}
        aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        onClick={() => toggleDone.mutate()}
        disabled={toggleDone.isPending}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium text-ink', done && 'text-ink-faint line-through')}>{task.title}</p>
        {task.description && <p className="mt-0.5 text-sm text-ink-soft">{task.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Pill tone={priorityMeta.tone}>{priorityMeta.label} priority</Pill>
          {!done && <Pill tone={statusMeta.tone}>{statusMeta.label}</Pill>}
          {task.dueDate && (
            <span className="text-xs text-ink-faint">
              Due {formatDate(task.dueDate)} ({relativeDays(task.dueDate)})
            </span>
          )}
        </div>
      </div>
      <ConfirmAction prompt="Delete this task?" disabled={remove.isPending} onConfirm={() => remove.mutate()}>
        {(startConfirm) => (
          <RowActions>
            <button type="button" className={iconButtonClass()} aria-label={`Edit "${task.title}"`} onClick={() => setEditing(true)}>
              <PencilIcon size={16} aria-hidden="true" />
            </button>
            <button type="button" className={iconButtonClass('danger')} aria-label={`Delete "${task.title}"`} onClick={startConfirm}>
              <TrashIcon size={16} aria-hidden="true" />
            </button>
          </RowActions>
        )}
      </ConfirmAction>
    </Card>
  );
}

export function TasksTab({
  applicationId,
  journeyId,
  tasks,
  isLoading,
  isError,
  error,
}: {
  applicationId: string;
  journeyId: string;
  tasks: Task[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const create = useMutation({
    mutationFn: (values: TaskFormValues) =>
      apiFetch('/tasks', {
        method: 'POST',
        body: {
          journeyId,
          applicationId,
          title: values.title.trim(),
          description: values.description.trim() || undefined,
          priority: values.priority,
          dueDate: values.dueDate || undefined,
        },
      }),
    onSuccess: async () => {
      setCreating(false);
      await queryClient.invalidateQueries({ queryKey: ['tasks', applicationId] });
    },
  });

  const sorted = useMemo(() => {
    if (!tasks) return tasks;
    return [...tasks].sort((a, b) => {
      if (Boolean(a.dueDate) !== Boolean(b.dueDate)) return a.dueDate ? -1 : 1;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return 0;
    });
  }, [tasks]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-soft">Break this application into concrete next steps.</p>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <PlusIcon size={14} aria-hidden="true" />
            Add task
          </Button>
        )}
      </div>

      {creating && (
        <TaskForm
          initial={EMPTY_FORM}
          showStatus={false}
          submitLabel="Add task"
          busy={create.isPending}
          error={create.isError ? friendlyErrorMessage(create.error) : null}
          onCancel={() => setCreating(false)}
          onSubmit={(values) => create.mutate(values)}
        />
      )}

      {isLoading && <Spinner label="Loading tasks…" />}
      {isError && <TabError message={friendlyErrorMessage(error)} />}
      {!isLoading && !isError && sorted && sorted.length === 0 && (
        <TabEmpty>No tasks yet. Add the first step you need to take above.</TabEmpty>
      )}
      {!isLoading && !isError && sorted?.map((task) => <TaskRow key={task.id} applicationId={applicationId} task={task} />)}
    </div>
  );
}
