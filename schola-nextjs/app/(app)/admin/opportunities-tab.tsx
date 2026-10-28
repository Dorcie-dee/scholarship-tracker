'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, friendlyErrorMessage } from '@/lib/api-client';
import { opportunityTypeLabel, studyLevelLabel } from '@/lib/status';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { FieldError, Input, Label, Textarea } from '@/components/ui/form';
import { Pill } from '@/components/ui/pill';
import { PencilIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { ACTION_ICON_BUTTON, DANGER_ICON_BUTTON, EmptyState, ErrorState, TableShell, TableSkeleton } from './admin-table';
import { useProgrammeOptions, useUniversityOptions } from './hooks';
import { OPPORTUNITY_TYPE_VALUES, STUDY_LEVEL_VALUES, type Opportunity, type PaginatedResult } from './types';

const PAGE_SIZE = 20;
const SELECT_CLASSES =
  'h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50';

function cleanOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

interface OpportunityDraft {
  title: string;
  provider: string;
  opportunityType: string;
  studyLevel: string;
  country: string;
  fundingType: string;
  fundingAmount: string;
  currency: string;
  duration: string;
  field: string;
  applicationUrl: string;
  eligibilitySummary: string;
  universityId: string;
  programmeId: string;
}

const EMPTY_DRAFT: OpportunityDraft = {
  title: '',
  provider: '',
  opportunityType: '',
  studyLevel: '',
  country: '',
  fundingType: '',
  fundingAmount: '',
  currency: '',
  duration: '',
  field: '',
  applicationUrl: '',
  eligibilitySummary: '',
  universityId: '',
  programmeId: '',
};

function draftFrom(o: Opportunity): OpportunityDraft {
  return {
    title: o.title,
    provider: o.provider ?? '',
    opportunityType: o.opportunityType ?? '',
    studyLevel: o.studyLevel ?? '',
    country: o.country ?? '',
    fundingType: o.fundingType ?? '',
    fundingAmount: o.fundingAmount ?? '',
    currency: o.currency ?? '',
    duration: o.duration ?? '',
    field: o.field ?? '',
    applicationUrl: o.applicationUrl ?? '',
    eligibilitySummary: o.eligibilitySummary ?? '',
    universityId: o.universityId ?? '',
    programmeId: o.programmeId ?? '',
  };
}

function bodyFrom(draft: OpportunityDraft): Record<string, string | undefined> {
  return {
    title: draft.title.trim(),
    provider: cleanOptional(draft.provider),
    opportunityType: cleanOptional(draft.opportunityType),
    studyLevel: cleanOptional(draft.studyLevel),
    country: cleanOptional(draft.country),
    fundingType: cleanOptional(draft.fundingType),
    fundingAmount: cleanOptional(draft.fundingAmount),
    currency: cleanOptional(draft.currency),
    duration: cleanOptional(draft.duration),
    field: cleanOptional(draft.field),
    applicationUrl: cleanOptional(draft.applicationUrl),
    eligibilitySummary: cleanOptional(draft.eligibilitySummary),
    universityId: cleanOptional(draft.universityId),
    programmeId: cleanOptional(draft.programmeId),
  };
}

/**
 * Shared by the add form and every row's edit-in-place form. The programme
 * picker is scoped to the chosen university (and cleared whenever the
 * university changes) so the UI can never submit a programme/university pair
 * `opportunities.service.ts#validateRelationships` would reject as
 * inconsistent.
 */
function OpportunityFormFields({
  idPrefix,
  draft,
  setDraft,
  universityOptions,
}: {
  idPrefix: string;
  draft: OpportunityDraft;
  setDraft: (next: OpportunityDraft) => void;
  universityOptions: Array<{ id: string; name: string }>;
}) {
  const programmeOptionsQuery = useProgrammeOptions(draft.universityId || undefined);
  const programmeOptions = programmeOptionsQuery.data?.items ?? [];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor={`${idPrefix}-title`}>Title *</Label>
        <Input id={`${idPrefix}-title`} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-provider`}>Provider</Label>
        <Input id={`${idPrefix}-provider`} value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value })} />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-type`}>Type</Label>
        <select
          id={`${idPrefix}-type`}
          className={SELECT_CLASSES}
          value={draft.opportunityType}
          onChange={(e) => setDraft({ ...draft, opportunityType: e.target.value })}
        >
          <option value="">Default (scholarship)</option>
          {OPPORTUNITY_TYPE_VALUES.map((type) => (
            <option key={type} value={type}>
              {opportunityTypeLabel(type)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-level`}>Study level</Label>
        <select
          id={`${idPrefix}-level`}
          className={SELECT_CLASSES}
          value={draft.studyLevel}
          onChange={(e) => setDraft({ ...draft, studyLevel: e.target.value })}
        >
          <option value="">Not set</option>
          {STUDY_LEVEL_VALUES.map((level) => (
            <option key={level} value={level}>
              {studyLevelLabel(level)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-country`}>Country</Label>
        <Input id={`${idPrefix}-country`} value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-field`}>Field</Label>
        <Input
          id={`${idPrefix}-field`}
          placeholder="e.g. Computer Science"
          value={draft.field}
          onChange={(e) => setDraft({ ...draft, field: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-funding-type`}>Funding type</Label>
        <Input
          id={`${idPrefix}-funding-type`}
          placeholder="e.g. Full, Partial"
          value={draft.fundingType}
          onChange={(e) => setDraft({ ...draft, fundingType: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-funding-amount`}>Funding amount</Label>
        <Input
          id={`${idPrefix}-funding-amount`}
          placeholder="e.g. 5000.00"
          value={draft.fundingAmount}
          onChange={(e) => setDraft({ ...draft, fundingAmount: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-currency`}>Currency</Label>
        <Input
          id={`${idPrefix}-currency`}
          placeholder="e.g. USD"
          value={draft.currency}
          onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-duration`}>Duration</Label>
        <Input
          id={`${idPrefix}-duration`}
          placeholder="e.g. 1 year"
          value={draft.duration}
          onChange={(e) => setDraft({ ...draft, duration: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-url`}>Application URL</Label>
        <Input
          id={`${idPrefix}-url`}
          placeholder="https://example.org/apply"
          value={draft.applicationUrl}
          onChange={(e) => setDraft({ ...draft, applicationUrl: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-university`}>University</Label>
        <select
          id={`${idPrefix}-university`}
          className={SELECT_CLASSES}
          value={draft.universityId}
          onChange={(e) => setDraft({ ...draft, universityId: e.target.value, programmeId: '' })}
        >
          <option value="">None</option>
          {universityOptions.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-programme`}>Programme</Label>
        <select
          id={`${idPrefix}-programme`}
          className={SELECT_CLASSES}
          value={draft.programmeId}
          disabled={!draft.universityId}
          onChange={(e) => setDraft({ ...draft, programmeId: e.target.value })}
        >
          <option value="">{draft.universityId ? 'None' : 'Choose a university first'}</option>
          {programmeOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={`${idPrefix}-eligibility`}>Eligibility summary</Label>
        <Textarea
          id={`${idPrefix}-eligibility`}
          value={draft.eligibilitySummary}
          onChange={(e) => setDraft({ ...draft, eligibilitySummary: e.target.value })}
        />
      </div>
    </div>
  );
}

export function OpportunitiesTab() {
  const queryClient = useQueryClient();
  const universitiesQuery = useUniversityOptions();
  const universities = useMemo(() => universitiesQuery.data?.items ?? [], [universitiesQuery.data]);

  const [isAdding, setIsAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<OpportunityDraft>(EMPTY_DRAFT);
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<OpportunityDraft>(EMPTY_DRAFT);
  const [editError, setEditError] = useState<string | null>(null);

  const opportunitiesQuery = useInfiniteQuery({
    queryKey: ['admin', 'opportunities'],
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiFetch<PaginatedResult<Opportunity>>(
        `/opportunities?limit=${PAGE_SIZE}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasNextPage ? (last.nextCursor ?? undefined) : undefined),
  });

  const opportunities = useMemo(
    () => opportunitiesQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [opportunitiesQuery.data],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'opportunities'] });
  }

  const createMutation = useMutation({
    mutationFn: (body: Record<string, string | undefined>) =>
      apiFetch<Opportunity>('/opportunities', { method: 'POST', body }),
    onSuccess: () => {
      invalidate();
      setIsAdding(false);
      setAddDraft(EMPTY_DRAFT);
      setAddError(null);
    },
    onError: (err: unknown) => setAddError(friendlyErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, string | undefined> }) =>
      apiFetch<Opportunity>(`/opportunities/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      setEditError(null);
    },
    onError: (err: unknown) => setEditError(friendlyErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/opportunities/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidate(),
  });

  function submitAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!addDraft.title.trim()) {
      setAddError('Title is required.');
      return;
    }
    createMutation.mutate(bodyFrom(addDraft));
  }

  function startEdit(o: Opportunity) {
    setIsAdding(false);
    setEditingId(o.id);
    setEditDraft(draftFrom(o));
    setEditError(null);
  }

  function submitEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingId) return;
    if (!editDraft.title.trim()) {
      setEditError('Title is required.');
      return;
    }
    updateMutation.mutate({ id: editingId, body: bodyFrom(editDraft) });
  }

  const formsLocked = isAdding || editingId !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          Anyone signed in can add an opportunity from Discover — this table is for curating what's already here.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setEditingId(null);
            setAddDraft(EMPTY_DRAFT);
            setAddError(null);
            setIsAdding((v) => !v);
          }}
        >
          <PlusIcon size={14} aria-hidden="true" />
          Add opportunity
        </Button>
      </div>

      {isAdding && (
        <form
          onSubmit={submitAdd}
          className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary-soft/40 p-4"
        >
          <OpportunityFormFields idPrefix="add-opp" draft={addDraft} setDraft={setAddDraft} universityOptions={universities} />
          <FieldError>{addError}</FieldError>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Adding…' : 'Add opportunity'}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsAdding(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {opportunitiesQuery.isLoading ? (
        <TableSkeleton />
      ) : opportunitiesQuery.isError ? (
        <ErrorState message={friendlyErrorMessage(opportunitiesQuery.error)} onRetry={() => opportunitiesQuery.refetch()} />
      ) : opportunities.length === 0 ? (
        <EmptyState label="No opportunities yet — add the first one above." />
      ) : (
        <>
          <TableShell>
            <thead>
              <tr className="border-b border-line bg-line-soft/40 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                <th scope="col" className="px-4 py-3">
                  Title
                </th>
                <th scope="col" className="px-4 py-3">
                  Type
                </th>
                <th scope="col" className="px-4 py-3">
                  Study level
                </th>
                <th scope="col" className="px-4 py-3">
                  Country
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((o) =>
                editingId === o.id ? (
                  <tr key={o.id} className="border-b border-line-soft last:border-0">
                    <td colSpan={5} className="px-4 py-4">
                      <form onSubmit={submitEdit} className="flex flex-col gap-3">
                        <OpportunityFormFields
                          idPrefix={`edit-opp-${o.id}`}
                          draft={editDraft}
                          setDraft={setEditDraft}
                          universityOptions={universities}
                        />
                        <FieldError>{editError}</FieldError>
                        <div className="flex items-center gap-2">
                          <Button type="submit" size="sm" disabled={updateMutation.isPending}>
                            {updateMutation.isPending ? 'Saving…' : 'Save'}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingId(null)}
                            disabled={updateMutation.isPending}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={o.id} className="border-b border-line-soft last:border-0">
                    <td className="px-4 py-3 text-sm font-semibold text-ink">{o.title}</td>
                    <td className="px-4 py-3 text-sm">
                      <Pill tone="primary">{opportunityTypeLabel(o.opportunityType)}</Pill>
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-soft">{o.studyLevel ? studyLevelLabel(o.studyLevel) : '—'}</td>
                    <td className="px-4 py-3 text-sm text-ink-soft">{o.country ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <ConfirmAction
                          prompt={`Delete ${o.title}?`}
                          onConfirm={() => deleteMutation.mutate(o.id)}
                          disabled={deleteMutation.isPending}
                        >
                          {(start) => (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => startEdit(o)}
                                aria-label={`Edit ${o.title}`}
                                disabled={formsLocked}
                                className={ACTION_ICON_BUTTON}
                              >
                                <PencilIcon size={15} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={start}
                                aria-label={`Delete ${o.title}`}
                                disabled={formsLocked}
                                className={DANGER_ICON_BUTTON}
                              >
                                <TrashIcon size={15} aria-hidden="true" />
                              </button>
                            </div>
                          )}
                        </ConfirmAction>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </TableShell>
          {opportunitiesQuery.hasNextPage && (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => opportunitiesQuery.fetchNextPage()}
                disabled={opportunitiesQuery.isFetchingNextPage}
              >
                {opportunitiesQuery.isFetchingNextPage ? 'Loading more…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
