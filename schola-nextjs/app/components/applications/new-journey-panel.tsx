'use client';

import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, friendlyErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/form';
import type { Journey, PaginatedResult, University } from '@/components/discover/types';

interface JourneyWithLinks extends Journey {
  universityId: string | null;
  programmeId: string | null;
}

/**
 * The "university/programme first" entry point into a journey — the
 * counterpart to starting from an Opportunity on `/opportunities`. Neither
 * is a prerequisite for the other (see `docs/decisions.md`, "Catalog data
 * vs. owned data (superseded)"). University/Programme names are typed, not
 * picked from a browsable catalog — `createUniversity`/`createProgramme`
 * on the backend reuse an existing same-named row for this owner rather
 * than duplicating it, so retyping a university you already added is safe
 * and just resolves back to it. The datalist below is pure convenience
 * (autocomplete against what you've already typed before), not a required
 * selection step.
 */
export function NewJourneyPanel({
  onCreated,
  onCancel,
}: {
  onCreated: (journey: JourneyWithLinks, reuseNotice?: string) => void;
  onCancel: () => void;
}) {
  const fieldId = useId();
  const queryClient = useQueryClient();
  const [universityName, setUniversityName] = useState('');
  const [programmeName, setProgrammeName] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const universitiesQuery = useQuery({
    queryKey: ['universities', 'lookup'],
    queryFn: () => apiFetch<PaginatedResult<University>>('/universities?limit=100'),
    staleTime: 5 * 60_000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const notices: string[] = [];

      let universityId: string | undefined;
      if (universityName.trim()) {
        const university = await apiFetch<University & { conflictingFields?: string[] }>('/universities', {
          method: 'POST',
          body: { name: universityName.trim() },
        });
        universityId = university.id;
        if (university.conflictingFields?.length) {
          notices.push(
            `You already had "${university.name}" saved — the one you just typed wasn't saved over it.`,
          );
        }
        void queryClient.invalidateQueries({ queryKey: ['universities', 'lookup'] });
      }

      let programmeId: string | undefined;
      if (programmeName.trim() && universityId) {
        const programme = await apiFetch<{ id: string; name: string; conflictingFields?: string[] }>(
          '/programmes',
          { method: 'POST', body: { universityId, name: programmeName.trim() } },
        );
        programmeId = programme.id;
        if (programme.conflictingFields?.length) {
          notices.push(
            `You already had "${programme.name}" saved under this university — the one you just typed wasn't saved over it.`,
          );
        }
      }

      const resolvedTitle = title.trim() || universityName.trim() || 'New application journey';
      const journey = await apiFetch<JourneyWithLinks>('/journeys', {
        method: 'POST',
        body: { title: resolvedTitle, ...(universityId ? { universityId } : {}), ...(programmeId ? { programmeId } : {}) },
      });
      return { journey, reuseNotice: notices.length > 0 ? notices.join(' ') : undefined };
    },
    onSuccess: ({ journey, reuseNotice }) => onCreated(journey, reuseNotice),
    onError: (err) => setError(friendlyErrorMessage(err)),
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!universityName.trim() && !title.trim()) {
      setError('Add a university or name this journey yourself.');
      return;
    }
    createMutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor={`${fieldId}-university`}>University</Label>
        <Input
          id={`${fieldId}-university`}
          list={`${fieldId}-university-options`}
          value={universityName}
          onChange={(e) => setUniversityName(e.target.value)}
          placeholder="e.g. University of Twente"
        />
        <datalist id={`${fieldId}-university-options`}>
          {(universitiesQuery.data?.items ?? []).map((u) => (
            <option key={u.id} value={u.name} />
          ))}
        </datalist>
      </div>

      <div>
        <Label htmlFor={`${fieldId}-programme`}>Programme (optional)</Label>
        <Input
          id={`${fieldId}-programme`}
          value={programmeName}
          onChange={(e) => setProgrammeName(e.target.value)}
          placeholder="e.g. MSc Computer Science"
          disabled={!universityName.trim()}
        />
      </div>

      <div>
        <Label htmlFor={`${fieldId}-title`}>Journey name</Label>
        <Input
          id={`${fieldId}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={universityName.trim() || 'e.g. Fall 2026 Master’s applications'}
        />
      </div>

      <FieldError>{error}</FieldError>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Starting…' : 'Start journey'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={createMutation.isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
