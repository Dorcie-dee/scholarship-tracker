'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { PaginatedResult, Programme, University } from './types';

/**
 * Shared catalog lookups used by more than one admin tab (Programmes'
 * university filter/picker, Opportunities' university+programme pickers).
 * Capped at 100 rows — the same limit `app/(app)/discover/page.tsx` already
 * uses for its own university lookup — fine for a typical catalog; a very
 * large one would need a searchable combobox instead of a plain `<select>`.
 */
export function useUniversityOptions() {
  return useQuery({
    queryKey: ['admin', 'universities', 'lookup'],
    queryFn: () => apiFetch<PaginatedResult<University>>('/universities?limit=100'),
    staleTime: 60_000,
  });
}

/** Only fetches once a university is chosen — a programme never exists without one. */
export function useProgrammeOptions(universityId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'programmes', 'lookup', universityId ?? 'none'],
    queryFn: () =>
      apiFetch<PaginatedResult<Programme>>(
        `/programmes?limit=100&universityId=${encodeURIComponent(universityId as string)}`,
      ),
    enabled: Boolean(universityId),
    staleTime: 60_000,
  });
}
