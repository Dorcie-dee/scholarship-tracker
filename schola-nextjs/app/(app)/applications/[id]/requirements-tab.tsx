'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, friendlyErrorMessage } from '@/lib/api-client';
import { requirementStatusMeta, formatDate } from '@/lib/status';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { FieldError, Label, Textarea } from '@/components/ui/form';
import { PencilIcon, PlusIcon, SparklesIcon, TrashIcon } from '@/components/icons';
import {
  REQUIREMENT_AUTHORITATIVE_STATUSES,
  REQUIREMENT_STATUS_VALUES,
  REQUIREMENT_TYPE_VALUES,
  requirementTypeLabel,
  type Requirement,
} from './types';
import { RowActions, Spinner, TabEmpty, TabError, iconButtonClass } from './tab-support';

const SELECT_CLASS =
  'h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

interface RequirementFormValues {
  requirementType: string;
  description: string;
  status: string;
  notes: string;
}

const EMPTY_FORM: RequirementFormValues = {
  requirementType: 'other',
  description: '',
  status: 'unknown',
  notes: '',
};

function RequirementForm({
  initial,
  submitLabel,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  initial: RequirementFormValues;
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: RequirementFormValues) => void;
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="req-type">Type</Label>
          <select
            id="req-type"
            className={`${SELECT_CLASS} w-full`}
            value={values.requirementType}
            onChange={(e) => setValues((v) => ({ ...v, requirementType: e.target.value }))}
          >
            {REQUIREMENT_TYPE_VALUES.map((t) => (
              <option key={t} value={t}>
                {requirementTypeLabel(t)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="req-status">Status</Label>
          <select
            id="req-status"
            className={`${SELECT_CLASS} w-full`}
            value={values.status}
            onChange={(e) => setValues((v) => ({ ...v, status: e.target.value }))}
          >
            {REQUIREMENT_STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {requirementStatusMeta(s).label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor="req-description">Description</Label>
        <Textarea
          id="req-description"
          required
          maxLength={4000}
          value={values.description}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
          placeholder="e.g. Minimum 3.5 GPA from an accredited university"
        />
      </div>
      <div>
        <Label htmlFor="req-notes">Notes (optional)</Label>
        <Textarea
          id="req-notes"
          maxLength={4000}
          value={values.notes}
          onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
        />
      </div>
      <FieldError>{error}</FieldError>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !values.description.trim()}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RequirementCard({ applicationId, requirement }: { applicationId: string; requirement: Requirement }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const key = ['requirements', applicationId];

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: key });
  }

  const update = useMutation({
    mutationFn: (values: RequirementFormValues) =>
      apiFetch(`/requirements/${requirement.id}`, {
        method: 'PATCH',
        body: {
          requirementType: values.requirementType,
          description: values.description.trim(),
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
    mutationFn: () => apiFetch(`/requirements/${requirement.id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError: (err) => setActionError(friendlyErrorMessage(err)),
  });

  const suggest = useMutation({
    mutationFn: () => apiFetch(`/requirements/${requirement.id}/ai-suggestion`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (err) => setActionError(friendlyErrorMessage(err)),
  });

  const confirmSuggestion = useMutation({
    mutationFn: () => apiFetch(`/requirements/${requirement.id}/ai-suggestion/confirm`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (err) => setActionError(friendlyErrorMessage(err)),
  });

  const rejectSuggestion = useMutation({
    mutationFn: () => apiFetch(`/requirements/${requirement.id}/ai-suggestion/reject`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (err) => setActionError(friendlyErrorMessage(err)),
  });

  if (editing) {
    return (
      <RequirementForm
        initial={{
          requirementType: requirement.requirementType,
          description: requirement.description,
          status: requirement.status,
          notes: requirement.notes ?? '',
        }}
        submitLabel="Save changes"
        busy={update.isPending}
        error={update.isError ? friendlyErrorMessage(update.error) : null}
        onCancel={() => setEditing(false)}
        onSubmit={(values) => update.mutate(values)}
      />
    );
  }

  const canSuggest = !REQUIREMENT_AUTHORITATIVE_STATUSES.has(requirement.status);
  const meta = requirementStatusMeta(requirement.status);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="neutral">{requirementTypeLabel(requirement.requirementType)}</Pill>
            <Pill tone={meta.tone}>{meta.label}</Pill>
          </div>
          <p className="mt-2 text-sm font-medium text-ink">{requirement.description}</p>
          {requirement.notes && <p className="mt-1 text-sm text-ink-soft">{requirement.notes}</p>}
        </div>
        <ConfirmAction prompt="Delete this requirement?" disabled={remove.isPending} onConfirm={() => remove.mutate()}>
          {(startConfirm) => (
            <RowActions>
              <button type="button" className={iconButtonClass()} aria-label="Edit requirement" onClick={() => setEditing(true)}>
                <PencilIcon size={16} aria-hidden="true" />
              </button>
              <button type="button" className={iconButtonClass('danger')} aria-label="Delete requirement" onClick={startConfirm}>
                <TrashIcon size={16} aria-hidden="true" />
              </button>
            </RowActions>
          )}
        </ConfirmAction>
      </div>

      {requirement.suggestedStatus ? (
        <div className="mt-3 rounded-lg bg-accent-soft p-3">
          <div className="flex items-start gap-2">
            <SparklesIcon size={16} className="mt-0.5 flex-none text-accent" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-accent">
                Suggested: {requirementStatusMeta(requirement.suggestedStatus).label}
              </p>
              {requirement.suggestionRationale && <p className="mt-0.5 text-sm text-ink-soft">{requirement.suggestionRationale}</p>}
              {requirement.suggestedAt && (
                <p className="mt-0.5 text-xs text-ink-faint">Suggested {formatDate(requirement.suggestedAt)}</p>
              )}
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => confirmSuggestion.mutate()} disabled={confirmSuggestion.isPending}>
                  {confirmSuggestion.isPending ? 'Confirming…' : 'Confirm'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => rejectSuggestion.mutate()}
                  disabled={rejectSuggestion.isPending}
                >
                  {rejectSuggestion.isPending ? 'Dismissing…' : 'Dismiss'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        canSuggest && (
          <div className="mt-3">
            <Button size="sm" variant="ghost" onClick={() => suggest.mutate()} disabled={suggest.isPending}>
              <SparklesIcon size={14} aria-hidden="true" />
              {suggest.isPending ? 'Thinking…' : 'Get an AI suggestion'}
            </Button>
          </div>
        )
      )}

      {actionError && <p className="mt-2 text-xs font-medium text-danger">{actionError}</p>}
    </Card>
  );
}

export function RequirementsTab({
  applicationId,
  requirements,
  isLoading,
  isError,
  error,
}: {
  applicationId: string;
  requirements: Requirement[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const create = useMutation({
    mutationFn: (values: RequirementFormValues) =>
      apiFetch('/requirements', {
        method: 'POST',
        body: {
          applicationId,
          requirementType: values.requirementType,
          description: values.description.trim(),
          status: values.status,
          notes: values.notes.trim() || undefined,
        },
      }),
    onSuccess: async () => {
      setCreating(false);
      await queryClient.invalidateQueries({ queryKey: ['requirements', applicationId] });
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-soft">Track what this application needs, and let Schola suggest a status from your profile.</p>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <PlusIcon size={14} aria-hidden="true" />
            Add requirement
          </Button>
        )}
      </div>

      {creating && (
        <RequirementForm
          initial={EMPTY_FORM}
          submitLabel="Add requirement"
          busy={create.isPending}
          error={create.isError ? friendlyErrorMessage(create.error) : null}
          onCancel={() => setCreating(false)}
          onSubmit={(values) => create.mutate(values)}
        />
      )}

      {isLoading && <Spinner label="Loading requirements…" />}
      {isError && <TabError message={friendlyErrorMessage(error)} />}
      {!isLoading && !isError && requirements && requirements.length === 0 && (
        <TabEmpty>No requirements yet. Add the first one above to start tracking what this application needs.</TabEmpty>
      )}
      {!isLoading &&
        !isError &&
        requirements?.map((requirement) => (
          <RequirementCard key={requirement.id} applicationId={applicationId} requirement={requirement} />
        ))}
    </div>
  );
}
