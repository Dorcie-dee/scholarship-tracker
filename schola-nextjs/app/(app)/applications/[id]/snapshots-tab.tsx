'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, friendlyErrorMessage } from '@/lib/api-client';
import { REQUIREMENT_MET_STATUSES, applicationStatusMeta, formatDate } from '@/lib/status';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { FieldError, Input, Label } from '@/components/ui/form';
import { ChevronDownIcon, PlusIcon, TrashIcon } from '@/components/icons';
import type { ApplicationSnapshot } from './types';
import { RowActions, Spinner, TabEmpty, TabError, iconButtonClass } from './tab-support';

const CREATED_VIA_LABELS: Record<string, string> = {
  manual: 'Saved manually',
  suggested: 'Suggested by Schola',
};

function SnapshotDetails({ snapshot }: { snapshot: ApplicationSnapshot }) {
  const requirements = snapshot.data.requirements ?? [];
  const metCount = requirements.filter((r) => REQUIREMENT_MET_STATUSES.has(r.status)).length;
  const documents = snapshot.data.documents ?? [];
  const statusAtTime = snapshot.data.application?.status;

  return (
    <details className="group mt-3 rounded-lg border border-line bg-paper px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-ink-soft">
        <ChevronDownIcon size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" />
        View snapshot details
      </summary>
      <dl className="mt-2 flex flex-col gap-1.5 text-sm text-ink-soft">
        {statusAtTime && (
          <div className="flex justify-between gap-2">
            <dt>Application status at the time</dt>
            <dd className="font-medium text-ink">{applicationStatusMeta(statusAtTime).label}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt>Requirements met</dt>
          <dd className="font-medium text-ink">
            {metCount} of {requirements.length}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Documents attached</dt>
          <dd className="font-medium text-ink">{documents.length}</dd>
        </div>
      </dl>
    </details>
  );
}

function RevisionForm({ initialLabel, busy, error, onCancel, onSubmit }: { initialLabel: string; busy: boolean; error: string | null; onCancel: () => void; onSubmit: (label: string) => void }) {
  const [label, setLabel] = useState(initialLabel);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(label);
      }}
      className="mt-3 flex flex-col gap-2 rounded-lg border border-line bg-paper p-3"
    >
      <Label htmlFor="revision-label">New revision label</Label>
      <Input id="revision-label" maxLength={255} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Optional label" />
      <FieldError>{error}</FieldError>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Saving…' : 'Create revision'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function SnapshotRow({ applicationId, snapshot }: { applicationId: string; snapshot: ApplicationSnapshot }) {
  const queryClient = useQueryClient();
  const [revising, setRevising] = useState(false);
  const key = ['snapshots', applicationId];

  const createRevision = useMutation({
    mutationFn: (label: string) =>
      apiFetch(`/applications/${applicationId}/snapshots/${snapshot.id}/revisions`, {
        method: 'POST',
        body: { label: label.trim() || null },
      }),
    onSuccess: async () => {
      setRevising(false);
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const remove = useMutation({
    mutationFn: () => apiFetch(`/applications/${applicationId}/snapshots/${snapshot.id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{snapshot.label || `Snapshot from ${formatDate(snapshot.createdAt)}`}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Pill tone="neutral">{CREATED_VIA_LABELS[snapshot.createdVia] ?? snapshot.createdVia}</Pill>
            <span className="text-xs text-ink-faint">{formatDate(snapshot.createdAt)}</span>
            {snapshot.supersedesSnapshotId && <span className="text-xs text-ink-faint">Revises an earlier snapshot</span>}
          </div>
        </div>
        <ConfirmAction prompt="Delete this snapshot?" disabled={remove.isPending} onConfirm={() => remove.mutate()}>
          {(startConfirm) => (
            <RowActions>
              <button type="button" className={iconButtonClass()} aria-label="Create a new revision of this snapshot" onClick={() => setRevising(true)}>
                <PlusIcon size={16} aria-hidden="true" />
              </button>
              <button type="button" className={iconButtonClass('danger')} aria-label="Delete this snapshot" onClick={startConfirm}>
                <TrashIcon size={16} aria-hidden="true" />
              </button>
            </RowActions>
          )}
        </ConfirmAction>
      </div>

      <SnapshotDetails snapshot={snapshot} />

      {revising && (
        <RevisionForm
          initialLabel={snapshot.label ?? ''}
          busy={createRevision.isPending}
          error={createRevision.isError ? friendlyErrorMessage(createRevision.error) : null}
          onCancel={() => setRevising(false)}
          onSubmit={(label) => createRevision.mutate(label)}
        />
      )}
    </Card>
  );
}

export function SnapshotsTab({
  applicationId,
  snapshots,
  isLoading,
  isError,
  error,
}: {
  applicationId: string;
  snapshots: ApplicationSnapshot[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');

  const create = useMutation({
    mutationFn: () => apiFetch(`/applications/${applicationId}/snapshots`, { method: 'POST', body: { label: label.trim() || undefined } }),
    onSuccess: async () => {
      setCreating(false);
      setLabel('');
      await queryClient.invalidateQueries({ queryKey: ['snapshots', applicationId] });
    },
  });

  const ordered = useMemo(() => (snapshots ? [...snapshots].reverse() : snapshots), [snapshots]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-soft">Save a point-in-time copy of this application's status, requirements and documents.</p>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <PlusIcon size={14} aria-hidden="true" />
            Save snapshot
          </Button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="flex flex-col gap-3 rounded-lg border border-line bg-paper p-4"
        >
          <div>
            <Label htmlFor="snapshot-label">Label (optional)</Label>
            <Input id="snapshot-label" maxLength={255} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Before submitting" />
          </div>
          <FieldError>{create.isError ? friendlyErrorMessage(create.error) : null}</FieldError>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Save snapshot'}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setCreating(false)} disabled={create.isPending}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {isLoading && <Spinner label="Loading snapshots…" />}
      {isError && <TabError message={friendlyErrorMessage(error)} />}
      {!isLoading && !isError && ordered && ordered.length === 0 && (
        <TabEmpty>No snapshots yet. Save one above any time you want to remember exactly where this application stood.</TabEmpty>
      )}
      {!isLoading && !isError && ordered?.map((snapshot) => <SnapshotRow key={snapshot.id} applicationId={applicationId} snapshot={snapshot} />)}
    </div>
  );
}
