'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, friendlyErrorMessage } from '@/lib/api-client';
import { studyLevelLabel } from '@/lib/status';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { FieldError, Input, Label, Textarea } from '@/components/ui/form';
import { PencilIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { ACTION_ICON_BUTTON, DANGER_ICON_BUTTON, EmptyState, ErrorState, TableShell, TableSkeleton } from './admin-table';
import { useUniversityOptions } from './hooks';
import { STUDY_LEVEL_VALUES, type PaginatedResult, type Programme } from './types';

const PAGE_SIZE = 20;
const SELECT_CLASSES =
  'h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

function cleanOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

interface ProgrammeDraft {
  universityId: string;
  name: string;
  studyLevel: string;
  field: string;
  duration: string;
  website: string;
  notes: string;
}

function emptyDraft(defaultUniversityId: string): ProgrammeDraft {
  return { universityId: defaultUniversityId, name: '', studyLevel: '', field: '', duration: '', website: '', notes: '' };
}

function draftFrom(p: Programme): ProgrammeDraft {
  return {
    universityId: p.universityId,
    name: p.name,
    studyLevel: p.studyLevel ?? '',
    field: p.field ?? '',
    duration: p.duration ?? '',
    website: p.website ?? '',
    notes: p.notes ?? '',
  };
}

function ProgrammeFormFields({
  idPrefix,
  draft,
  setDraft,
  universityOptions,
}: {
  idPrefix: string;
  draft: ProgrammeDraft;
  setDraft: (next: ProgrammeDraft) => void;
  universityOptions: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor={`${idPrefix}-university`}>University *</Label>
        <select
          id={`${idPrefix}-university`}
          className={SELECT_CLASSES}
          value={draft.universityId}
          onChange={(e) => setDraft({ ...draft, universityId: e.target.value })}
        >
          {universityOptions.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-name`}>Name *</Label>
        <Input id={`${idPrefix}-name`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
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
        <Label htmlFor={`${idPrefix}-field`}>Field</Label>
        <Input id={`${idPrefix}-field`} value={draft.field} onChange={(e) => setDraft({ ...draft, field: e.target.value })} />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-duration`}>Duration</Label>
        <Input
          id={`${idPrefix}-duration`}
          placeholder="e.g. 2 years"
          value={draft.duration}
          onChange={(e) => setDraft({ ...draft, duration: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-website`}>Website</Label>
        <Input
          id={`${idPrefix}-website`}
          placeholder="https://example.edu/programme"
          value={draft.website}
          onChange={(e) => setDraft({ ...draft, website: e.target.value })}
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={`${idPrefix}-notes`}>Notes</Label>
        <Textarea id={`${idPrefix}-notes`} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
      </div>
    </div>
  );
}

export function ProgrammesTab() {
  const queryClient = useQueryClient();
  const universitiesQuery = useUniversityOptions();
  const universities = useMemo(() => universitiesQuery.data?.items ?? [], [universitiesQuery.data]);
  const universityNameById = useMemo(() => new Map(universities.map((u) => [u.id, u.name])), [universities]);

  const [filterUniversityId, setFilterUniversityId] = useState('');

  const [isAdding, setIsAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<ProgrammeDraft>(emptyDraft(''));
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ProgrammeDraft>(emptyDraft(''));
  const [editError, setEditError] = useState<string | null>(null);

  const programmesQuery = useInfiniteQuery({
    queryKey: ['admin', 'programmes', filterUniversityId],
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiFetch<PaginatedResult<Programme>>(
        `/programmes?limit=${PAGE_SIZE}${filterUniversityId ? `&universityId=${encodeURIComponent(filterUniversityId)}` : ''}${
          pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''
        }`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasNextPage ? (last.nextCursor ?? undefined) : undefined),
  });

  const programmes = useMemo(() => programmesQuery.data?.pages.flatMap((p) => p.items) ?? [], [programmesQuery.data]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'programmes'] });
  }

  const createMutation = useMutation({
    mutationFn: (body: Record<string, string | undefined>) =>
      apiFetch<Programme>('/programmes', { method: 'POST', body }),
    onSuccess: () => {
      invalidate();
      setIsAdding(false);
      setAddError(null);
    },
    onError: (err: unknown) => setAddError(friendlyErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, string | undefined> }) =>
      apiFetch<Programme>(`/programmes/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      setEditError(null);
    },
    onError: (err: unknown) => setEditError(friendlyErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/programmes/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidate(),
  });

  function bodyFrom(draft: ProgrammeDraft): Record<string, string | undefined> {
    return {
      universityId: draft.universityId,
      name: draft.name.trim(),
      studyLevel: cleanOptional(draft.studyLevel),
      field: cleanOptional(draft.field),
      duration: cleanOptional(draft.duration),
      website: cleanOptional(draft.website),
      notes: cleanOptional(draft.notes),
    };
  }

  function startAdd() {
    setEditingId(null);
    setAddError(null);
    setAddDraft(emptyDraft(filterUniversityId || universities[0]?.id || ''));
    setIsAdding(true);
  }

  function submitAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!addDraft.universityId) {
      setAddError('Choose a university.');
      return;
    }
    if (!addDraft.name.trim()) {
      setAddError('Name is required.');
      return;
    }
    createMutation.mutate(bodyFrom(addDraft));
  }

  function startEdit(p: Programme) {
    setIsAdding(false);
    setEditingId(p.id);
    setEditDraft(draftFrom(p));
    setEditError(null);
  }

  function submitEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingId) return;
    if (!editDraft.universityId) {
      setEditError('Choose a university.');
      return;
    }
    if (!editDraft.name.trim()) {
      setEditError('Name is required.');
      return;
    }
    updateMutation.mutate({ id: editingId, body: bodyFrom(editDraft) });
  }

  const formsLocked = isAdding || editingId !== null;
  const noUniversitiesYet = !universitiesQuery.isLoading && universities.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-soft sm:max-w-xs sm:flex-1">
          Filter by university
          <select
            className={SELECT_CLASSES}
            value={filterUniversityId}
            onChange={(e) => setFilterUniversityId(e.target.value)}
          >
            <option value="">All universities</option>
            {universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="secondary" size="sm" onClick={startAdd} disabled={noUniversitiesYet}>
          <PlusIcon size={14} aria-hidden="true" />
          Add programme
        </Button>
      </div>

      {noUniversitiesYet && (
        <p className="text-sm text-ink-faint">Add a university first — a programme must belong to one.</p>
      )}

      {isAdding && (
        <form
          onSubmit={submitAdd}
          className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary-soft/40 p-4"
        >
          <ProgrammeFormFields idPrefix="add-prog" draft={addDraft} setDraft={setAddDraft} universityOptions={universities} />
          <FieldError>{addError}</FieldError>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Adding…' : 'Add programme'}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsAdding(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {programmesQuery.isLoading ? (
        <TableSkeleton />
      ) : programmesQuery.isError ? (
        <ErrorState message={friendlyErrorMessage(programmesQuery.error)} onRetry={() => programmesQuery.refetch()} />
      ) : programmes.length === 0 ? (
        <EmptyState label={filterUniversityId ? 'No programmes for this university yet.' : 'No programmes yet — add the first one above.'} />
      ) : (
        <>
          <TableShell>
            <thead>
              <tr className="border-b border-line bg-line-soft/40 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                <th scope="col" className="px-4 py-3">
                  Name
                </th>
                <th scope="col" className="px-4 py-3">
                  University
                </th>
                <th scope="col" className="px-4 py-3">
                  Study level
                </th>
                <th scope="col" className="px-4 py-3">
                  Field
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {programmes.map((p) =>
                editingId === p.id ? (
                  <tr key={p.id} className="border-b border-line-soft last:border-0">
                    <td colSpan={5} className="px-4 py-4">
                      <form onSubmit={submitEdit} className="flex flex-col gap-3">
                        <ProgrammeFormFields
                          idPrefix={`edit-prog-${p.id}`}
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
                  <tr key={p.id} className="border-b border-line-soft last:border-0">
                    <td className="px-4 py-3 text-sm font-semibold text-ink">{p.name}</td>
                    <td className="px-4 py-3 text-sm text-ink-soft">{universityNameById.get(p.universityId) ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-ink-soft">{p.studyLevel ? studyLevelLabel(p.studyLevel) : '—'}</td>
                    <td className="px-4 py-3 text-sm text-ink-soft">{p.field ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <ConfirmAction
                          prompt={`Delete ${p.name}?`}
                          onConfirm={() => deleteMutation.mutate(p.id)}
                          disabled={deleteMutation.isPending}
                        >
                          {(start) => (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => startEdit(p)}
                                aria-label={`Edit ${p.name}`}
                                disabled={formsLocked}
                                className={ACTION_ICON_BUTTON}
                              >
                                <PencilIcon size={15} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={start}
                                aria-label={`Delete ${p.name}`}
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
          {programmesQuery.hasNextPage && (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => programmesQuery.fetchNextPage()}
                disabled={programmesQuery.isFetchingNextPage}
              >
                {programmesQuery.isFetchingNextPage ? 'Loading more…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
