'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, friendlyErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { FieldError, Input, Label, Textarea } from '@/components/ui/form';
import { GlobeIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from '@/components/icons';
import { useDebouncedValue } from '@/components/discover/use-debounced-value';
import { ACTION_ICON_BUTTON, DANGER_ICON_BUTTON, EmptyState, ErrorState, TableShell, TableSkeleton } from './admin-table';
import type { PaginatedResult, University } from './types';

const PAGE_SIZE = 20;

/** Optional fields go through this before being sent — an empty string must become "absent", not a value that fails the backend's `z.string().url()`/`.min(1)` checks. */
function cleanOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

interface UniversityDraft {
  name: string;
  country: string;
  website: string;
  notes: string;
}

const EMPTY_DRAFT: UniversityDraft = { name: '', country: '', website: '', notes: '' };

function draftFrom(u: University): UniversityDraft {
  return { name: u.name, country: u.country ?? '', website: u.website ?? '', notes: u.notes ?? '' };
}

function UniversityFormFields({
  idPrefix,
  draft,
  setDraft,
}: {
  idPrefix: string;
  draft: UniversityDraft;
  setDraft: (next: UniversityDraft) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor={`${idPrefix}-name`}>Name *</Label>
        <Input id={`${idPrefix}-name`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-country`}>Country</Label>
        <Input
          id={`${idPrefix}-country`}
          value={draft.country}
          onChange={(e) => setDraft({ ...draft, country: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-website`}>Website</Label>
        <Input
          id={`${idPrefix}-website`}
          placeholder="https://example.edu"
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

export function UniversitiesTab() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput.trim(), 300);

  const [isAdding, setIsAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<UniversityDraft>(EMPTY_DRAFT);
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<UniversityDraft>(EMPTY_DRAFT);
  const [editError, setEditError] = useState<string | null>(null);

  const universitiesQuery = useInfiniteQuery({
    queryKey: ['admin', 'universities', search],
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiFetch<PaginatedResult<University>>(
        `/universities?limit=${PAGE_SIZE}&search=${encodeURIComponent(search)}${
          pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''
        }`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasNextPage ? (last.nextCursor ?? undefined) : undefined),
  });

  const universities = useMemo(
    () => universitiesQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [universitiesQuery.data],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'universities'] });
  }

  const createMutation = useMutation({
    mutationFn: (body: Record<string, string | undefined>) =>
      apiFetch<University>('/universities', { method: 'POST', body }),
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
      apiFetch<University>(`/universities/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      setEditError(null);
    },
    onError: (err: unknown) => setEditError(friendlyErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/universities/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidate(),
  });

  function submitAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!addDraft.name.trim()) {
      setAddError('Name is required.');
      return;
    }
    createMutation.mutate({
      name: addDraft.name.trim(),
      country: cleanOptional(addDraft.country),
      website: cleanOptional(addDraft.website),
      notes: cleanOptional(addDraft.notes),
    });
  }

  function startEdit(u: University) {
    setIsAdding(false);
    setEditingId(u.id);
    setEditDraft(draftFrom(u));
    setEditError(null);
  }

  function submitEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingId) return;
    if (!editDraft.name.trim()) {
      setEditError('Name is required.');
      return;
    }
    updateMutation.mutate({
      id: editingId,
      body: {
        name: editDraft.name.trim(),
        country: cleanOptional(editDraft.country),
        website: cleanOptional(editDraft.website),
        notes: cleanOptional(editDraft.notes),
      },
    });
  }

  const formsLocked = isAdding || editingId !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <SearchIcon
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
            aria-hidden="true"
          />
          <Label htmlFor="university-search" className="sr-only">
            Search universities
          </Label>
          <Input
            id="university-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name"
            className="pl-9"
          />
        </div>
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
          Add university
        </Button>
      </div>

      {isAdding && (
        <form
          onSubmit={submitAdd}
          className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary-soft/40 p-4"
        >
          <UniversityFormFields idPrefix="add-uni" draft={addDraft} setDraft={setAddDraft} />
          <FieldError>{addError}</FieldError>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Adding…' : 'Add university'}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsAdding(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {universitiesQuery.isLoading ? (
        <TableSkeleton />
      ) : universitiesQuery.isError ? (
        <ErrorState message={friendlyErrorMessage(universitiesQuery.error)} onRetry={() => universitiesQuery.refetch()} />
      ) : universities.length === 0 ? (
        <EmptyState label={search ? 'No universities match that search.' : 'No universities yet — add the first one above.'} />
      ) : (
        <>
          <TableShell>
            <thead>
              <tr className="border-b border-line bg-line-soft/40 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                <th scope="col" className="px-4 py-3">
                  Name
                </th>
                <th scope="col" className="px-4 py-3">
                  Country
                </th>
                <th scope="col" className="px-4 py-3">
                  Website
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {universities.map((u) =>
                editingId === u.id ? (
                  <tr key={u.id} className="border-b border-line-soft last:border-0">
                    <td colSpan={4} className="px-4 py-4">
                      <form onSubmit={submitEdit} className="flex flex-col gap-3">
                        <UniversityFormFields idPrefix={`edit-uni-${u.id}`} draft={editDraft} setDraft={setEditDraft} />
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
                  <tr key={u.id} className="border-b border-line-soft last:border-0">
                    <td className="px-4 py-3 text-sm font-semibold text-ink">{u.name}</td>
                    <td className="px-4 py-3 text-sm text-ink-soft">{u.country ?? '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      {u.website ? (
                        <a
                          href={u.website}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <GlobeIcon size={14} aria-hidden="true" />
                          Visit
                        </a>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <ConfirmAction
                          prompt={`Delete ${u.name}?`}
                          onConfirm={() => deleteMutation.mutate(u.id)}
                          disabled={deleteMutation.isPending}
                        >
                          {(start) => (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => startEdit(u)}
                                aria-label={`Edit ${u.name}`}
                                disabled={formsLocked}
                                className={ACTION_ICON_BUTTON}
                              >
                                <PencilIcon size={15} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={start}
                                aria-label={`Delete ${u.name}`}
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
          {universitiesQuery.hasNextPage && (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => universitiesQuery.fetchNextPage()}
                disabled={universitiesQuery.isFetchingNextPage}
              >
                {universitiesQuery.isFetchingNextPage ? 'Loading more…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
