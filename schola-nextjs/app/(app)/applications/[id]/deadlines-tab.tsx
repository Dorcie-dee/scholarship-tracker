'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, friendlyErrorMessage } from '@/lib/api-client';
import { deadlineStatusMeta, formatDate, relativeDays } from '@/lib/status';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { FieldError, Input, Label, Textarea } from '@/components/ui/form';
import { cn } from '@/lib/cn';
import { PencilIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { DEADLINE_STATUS_VALUES, DEADLINE_TYPE_VALUES, deadlineTypeLabel, type Deadline } from './types';
import { RowActions, Spinner, TabEmpty, TabError, iconButtonClass } from './tab-support';

const SELECT_CLASS =
  'h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

interface DeadlineFormValues {
  label: string;
  deadlineType: string;
  date: string;
  status: string;
  notes: string;
}

const EMPTY_FORM: DeadlineFormValues = { label: '', deadlineType: 'other', date: '', status: 'upcoming', notes: '' };

/** `YYYY-MM-DD` for a native date input from an ISO/date-time string. */
function toDateInputValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function DeadlineForm({
  initial,
  showStatus,
  submitLabel,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  initial: DeadlineFormValues;
  showStatus: boolean;
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: DeadlineFormValues) => void;
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
        <Label htmlFor="deadline-label">Label</Label>
        <Input
          id="deadline-label"
          required
          maxLength={255}
          value={values.label}
          onChange={(e) => setValues((v) => ({ ...v, label: e.target.value }))}
          placeholder="e.g. Scholarship application closes"
        />
      </div>
      <div className={cn('grid gap-3', showStatus ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        <div>
          <Label htmlFor="deadline-type">Type</Label>
          <select
            id="deadline-type"
            className={`${SELECT_CLASS} w-full`}
            value={values.deadlineType}
            onChange={(e) => setValues((v) => ({ ...v, deadlineType: e.target.value }))}
          >
            {DEADLINE_TYPE_VALUES.map((t) => (
              <option key={t} value={t}>
                {deadlineTypeLabel(t)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="deadline-date">Date</Label>
          <Input
            id="deadline-date"
            type="date"
            required
            value={values.date}
            onChange={(e) => setValues((v) => ({ ...v, date: e.target.value }))}
          />
        </div>
        {showStatus && (
          <div>
            <Label htmlFor="deadline-status">Status</Label>
            <select
              id="deadline-status"
              className={`${SELECT_CLASS} w-full`}
              value={values.status}
              onChange={(e) => setValues((v) => ({ ...v, status: e.target.value }))}
            >
              {DEADLINE_STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {deadlineStatusMeta(s).label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div>
        <Label htmlFor="deadline-notes">Notes (optional)</Label>
        <Textarea
          id="deadline-notes"
          value={values.notes}
          onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
        />
      </div>
      <FieldError>{error}</FieldError>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !values.label.trim() || !values.date}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DeadlineRow({ applicationId, deadline }: { applicationId: string; deadline: Deadline }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const key = ['deadlines', applicationId];

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: key });
  }

  const update = useMutation({
    mutationFn: (values: DeadlineFormValues) =>
      apiFetch(`/deadlines/${deadline.id}`, {
        method: 'PATCH',
        body: {
          label: values.label.trim(),
          deadlineType: values.deadlineType,
          date: values.date,
          status: values.status,
          notes: values.notes.trim() || undefined,
        },
      }),
    onSuccess: async () => {
      setEditing(false);
      await invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: () => apiFetch(`/deadlines/${deadline.id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  if (editing) {
    return (
      <DeadlineForm
        initial={{
          label: deadline.label,
          deadlineType: deadline.deadlineType,
          date: toDateInputValue(deadline.date),
          status: deadline.status,
          notes: deadline.notes ?? '',
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

  const meta = deadlineStatusMeta(deadline.status);

  return (
    <Card className="flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{deadline.label}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Pill tone="neutral">{deadlineTypeLabel(deadline.deadlineType)}</Pill>
          <Pill tone={meta.tone}>{meta.label}</Pill>
          <span className="text-xs text-ink-faint">
            {formatDate(deadline.date)} ({relativeDays(deadline.date)})
          </span>
        </div>
        {deadline.notes && <p className="mt-2 text-sm text-ink-soft">{deadline.notes}</p>}
      </div>
      <RowActions>
        <button type="button" className={iconButtonClass()} aria-label={`Edit "${deadline.label}"`} onClick={() => setEditing(true)}>
          <PencilIcon size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={iconButtonClass('danger')}
          aria-label={`Delete "${deadline.label}"`}
          onClick={() => {
            if (window.confirm('Delete this deadline? This cannot be undone.')) remove.mutate();
          }}
        >
          <TrashIcon size={16} aria-hidden="true" />
        </button>
      </RowActions>
    </Card>
  );
}

export function DeadlinesTab({
  applicationId,
  deadlines,
  isLoading,
  isError,
  error,
}: {
  applicationId: string;
  deadlines: Deadline[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const create = useMutation({
    mutationFn: (values: DeadlineFormValues) =>
      apiFetch('/deadlines', {
        method: 'POST',
        body: {
          applicationId,
          label: values.label.trim(),
          deadlineType: values.deadlineType,
          date: values.date,
          notes: values.notes.trim() || undefined,
        },
      }),
    onSuccess: async () => {
      setCreating(false);
      await queryClient.invalidateQueries({ queryKey: ['deadlines', applicationId] });
    },
  });

  const sorted = useMemo(() => (deadlines ? [...deadlines].sort((a, b) => a.date.localeCompare(b.date)) : deadlines), [deadlines]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-soft">Keep every date for this application in one place.</p>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <PlusIcon size={14} aria-hidden="true" />
            Add deadline
          </Button>
        )}
      </div>

      {creating && (
        <DeadlineForm
          initial={EMPTY_FORM}
          showStatus={false}
          submitLabel="Add deadline"
          busy={create.isPending}
          error={create.isError ? friendlyErrorMessage(create.error) : null}
          onCancel={() => setCreating(false)}
          onSubmit={(values) => create.mutate(values)}
        />
      )}

      {isLoading && <Spinner label="Loading deadlines…" />}
      {isError && <TabError message={friendlyErrorMessage(error)} />}
      {!isLoading && !isError && sorted && sorted.length === 0 && (
        <TabEmpty>No deadlines yet. Add one above so nothing sneaks up on you.</TabEmpty>
      )}
      {!isLoading && !isError && sorted?.map((deadline) => <DeadlineRow key={deadline.id} applicationId={applicationId} deadline={deadline} />)}
    </div>
  );
}
