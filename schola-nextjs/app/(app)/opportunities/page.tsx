'use client';

import { useMemo, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { useRouter } from 'next/navigation';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, friendlyErrorMessage } from '@/lib/api-client';
import { opportunityTypeLabel, studyLevelLabel } from '@/lib/status';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Input, Label } from '@/components/ui/form';
import { PlusIcon, SearchIcon, SparklesIcon } from '@/components/icons';
import { useDebouncedValue } from '@/components/discover/use-debounced-value';
import { OpportunityCard } from '@/components/discover/opportunity-card';
import { AddOpportunityPanel } from '@/components/discover/add-opportunity-panel';
import { Toast, type ToastState } from '@/components/discover/toast';
import {
  OPPORTUNITY_TYPE_VALUES,
  STUDY_LEVEL_VALUES,
  type Application,
  type Journey,
  type Opportunity,
  type PaginatedResult,
  type University,
} from '@/components/discover/types';

/** A page worth of rows per request — large enough that most searches/filters resolve without a "Load more" click. */
const PAGE_SIZE = 48;

const SELECT_CLASSES =
  'h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:w-auto';

function FilterSelect({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-soft">
      {label}
      <select className={SELECT_CLASSES} {...props}>
        {children}
      </select>
    </label>
  );
}

function CardSkeleton() {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="h-5 w-24 animate-pulse rounded-full bg-line-soft" />
      <div className="h-5 w-3/4 animate-pulse rounded bg-line-soft" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-line-soft" />
      <div className="h-16 w-full animate-pulse rounded bg-line-soft" />
      <div className="h-8 w-32 animate-pulse rounded-lg bg-line-soft" />
    </Card>
  );
}

/**
 * My Opportunities — every scholarship/grant/fellowship/programme the
 * caller has personally added or imported. This used to be a shared,
 * admin-seeded catalog every user browsed (`/discover`); opportunities are
 * now personal workspace data (see `docs/decisions.md`, "Catalog data vs.
 * owned data (superseded)"), so `GET /opportunities` already returns only
 * the caller's own rows — this page needs no client-side ownership
 * filtering, just the "add your own" entry point a shared catalog never
 * needed.
 */
export default function OpportunitiesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput.trim().toLowerCase(), 300);
  const [studyLevel, setStudyLevel] = useState('');
  const [opportunityType, setOpportunityType] = useState('');
  const [country, setCountry] = useState('');

  const [isAdding, setIsAdding] = useState(false);
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const opportunitiesQuery = useInfiniteQuery({
    queryKey: ['opportunities', 'mine'],
    queryFn: ({ pageParam }) =>
      apiFetch<PaginatedResult<Opportunity>>(
        `/opportunities?limit=${PAGE_SIZE}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? (lastPage.nextCursor ?? undefined) : undefined),
  });

  const universitiesQuery = useQuery({
    queryKey: ['universities', 'lookup'],
    queryFn: () => apiFetch<PaginatedResult<University>>('/universities?limit=100'),
    staleTime: 5 * 60_000,
  });

  const journeysQuery = useQuery({
    queryKey: ['journeys', 'all'],
    queryFn: () => apiFetch<PaginatedResult<Journey>>('/journeys?limit=100'),
    staleTime: 60_000,
  });

  const universityNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const university of universitiesQuery.data?.items ?? []) {
      map.set(university.id, university.name);
    }
    return map;
  }, [universitiesQuery.data]);

  const opportunities = useMemo(
    () => opportunitiesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [opportunitiesQuery.data],
  );

  const countryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const opportunity of opportunities) {
      if (opportunity.country) set.add(opportunity.country);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [opportunities]);

  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((opportunity) => {
      if (studyLevel && opportunity.studyLevel !== studyLevel) return false;
      if (opportunityType && opportunity.opportunityType !== opportunityType) return false;
      if (country && opportunity.country !== country) return false;
      if (search) {
        const universityName = opportunity.universityId ? universityNameById.get(opportunity.universityId) : undefined;
        const haystack = [opportunity.title, opportunity.provider, universityName, opportunity.field]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }, [opportunities, studyLevel, opportunityType, country, search, universityNameById]);

  const hasActiveFilters = Boolean(searchInput || studyLevel || opportunityType || country);
  const isEmptyWorkspace = !opportunitiesQuery.isLoading && !opportunitiesQuery.isError && opportunities.length === 0;

  function clearFilters() {
    setSearchInput('');
    setStudyLevel('');
    setOpportunityType('');
    setCountry('');
  }

  const createJourneyMutation = useMutation({
    mutationFn: (title: string) => apiFetch<Journey>('/journeys', { method: 'POST', body: { title } }),
    onSuccess: (journey) => {
      queryClient.setQueryData<PaginatedResult<Journey>>(['journeys', 'all'], (prev) =>
        prev ? { ...prev, items: [journey, ...prev.items] } : prev,
      );
    },
  });

  const createApplicationMutation = useMutation({
    mutationFn: (input: { journeyId: string; opportunityId: string; title: string }) =>
      apiFetch<Application>('/applications', { method: 'POST', body: input }),
  });

  function toggleExpand(opportunityId: string) {
    setSubmitError(null);
    setActivePanelId((prev) => (prev === opportunityId ? null : opportunityId));
  }

  async function startApplication(journeyId: string, opportunity: Opportunity) {
    setSubmitError(null);
    try {
      const application = await createApplicationMutation.mutateAsync({
        journeyId,
        opportunityId: opportunity.id,
        title: opportunity.title,
      });
      setActivePanelId(null);
      setToast({ message: `Added "${opportunity.title}" to your applications.`, tone: 'success' });
      router.push(`/applications/${application.id}`);
    } catch (error) {
      setSubmitError(friendlyErrorMessage(error));
    }
  }

  async function createJourneyAndStart(title: string, opportunity: Opportunity) {
    setSubmitError(null);
    try {
      const journey = await createJourneyMutation.mutateAsync(title);
      await startApplication(journey.id, opportunity);
    } catch (error) {
      setSubmitError(friendlyErrorMessage(error));
    }
  }

  function handleOpportunityCreated(opportunity: Opportunity) {
    setIsAdding(false);
    queryClient.setQueryData<{ pages: PaginatedResult<Opportunity>[]; pageParams: unknown[] }>(
      ['opportunities', 'mine'],
      (prev) =>
        prev
          ? { ...prev, pages: [{ ...prev.pages[0], items: [opportunity, ...prev.pages[0].items] }, ...prev.pages.slice(1)] }
          : prev,
    );
    setToast({ message: `Added "${opportunity.title}" to your opportunities.`, tone: 'success' });
  }

  const submitting = createJourneyMutation.isPending || createApplicationMutation.isPending;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-page-title font-semibold text-ink sm:text-page-title-lg">My opportunities</h1>
          <p className="mt-1.5 max-w-xl text-supporting text-ink-soft">
            Every scholarship, grant, and fellowship you've brought into Schola — paste a link or add one by hand.
          </p>
        </div>
        <Button type="button" onClick={() => setIsAdding(true)} className="flex-none">
          <PlusIcon size={18} aria-hidden="true" />
          Add opportunity
        </Button>
      </div>

      <Drawer
        open={isAdding}
        onClose={() => setIsAdding(false)}
        title="Add an opportunity"
        description="Bring in a scholarship, grant, or programme you found — paste its link or enter it yourself."
      >
        <AddOpportunityPanel onCreated={handleOpportunityCreated} onCancel={() => setIsAdding(false)} />
      </Drawer>

      {!isEmptyWorkspace && (
        <div className="mt-6 flex flex-col gap-3">
          <div className="relative">
            <SearchIcon
              size={18}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint"
              aria-hidden="true"
            />
            <Label htmlFor="opportunities-search" className="sr-only">
              Search your opportunities
            </Label>
            <Input
              id="opportunities-search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by title, field, university, or provider"
              className="pl-10"
            />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <FilterSelect label="Study level" value={studyLevel} onChange={(e) => setStudyLevel(e.target.value)}>
              <option value="">All study levels</option>
              {STUDY_LEVEL_VALUES.map((value) => (
                <option key={value} value={value}>
                  {studyLevelLabel(value)}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect label="Type" value={opportunityType} onChange={(e) => setOpportunityType(e.target.value)}>
              <option value="">All types</option>
              {OPPORTUNITY_TYPE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {opportunityTypeLabel(value)}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect label="Country" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">All countries</option>
              {countryOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </FilterSelect>

            {hasActiveFilters && (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="mb-0.5">
                Clear filters
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="mt-6">
        {opportunitiesQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : opportunitiesQuery.isError ? (
          <Card className="p-6 text-center">
            <h2 className="font-display text-section-heading font-semibold text-ink">We couldn't load your opportunities</h2>
            <p className="mt-2 text-sm text-ink-soft">{friendlyErrorMessage(opportunitiesQuery.error)}</p>
            <Button className="mt-4" onClick={() => opportunitiesQuery.refetch()}>
              Try again
            </Button>
          </Card>
        ) : isEmptyWorkspace ? (
          <Card className="flex flex-col items-center gap-2 p-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
              <SparklesIcon size={24} aria-hidden="true" />
            </span>
            <h2 className="font-display text-section-heading font-semibold text-ink">Nothing here yet</h2>
            <p className="max-w-sm text-sm text-ink-soft">
              Found a scholarship, grant, or programme somewhere else? Paste its link or add it by hand — Schola
              will help you track it from there.
            </p>
            <Button type="button" className="mt-2" onClick={() => setIsAdding(true)}>
              <PlusIcon size={16} aria-hidden="true" />
              Add your first opportunity
            </Button>
          </Card>
        ) : filteredOpportunities.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-10 text-center">
            <SearchIcon size={28} className="text-ink-faint" aria-hidden="true" />
            <h2 className="font-display text-section-heading font-semibold text-ink">No opportunities match yet</h2>
            <p className="max-w-sm text-sm text-ink-soft">Try a different search or filter.</p>
            {hasActiveFilters && (
              <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {filteredOpportunities.map((opportunity) => (
                <OpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  universityName={
                    opportunity.universityId ? universityNameById.get(opportunity.universityId) : undefined
                  }
                  isExpanded={activePanelId === opportunity.id}
                  onToggleExpand={() => toggleExpand(opportunity.id)}
                  journeys={journeysQuery.data?.items}
                  journeysLoading={journeysQuery.isLoading}
                  journeysErrored={journeysQuery.isError}
                  submitting={submitting}
                  submitError={activePanelId === opportunity.id ? submitError : null}
                  onStart={(journeyId) => startApplication(journeyId, opportunity)}
                  onCreateAndStart={(title) => createJourneyAndStart(title, opportunity)}
                  onRetryJourneys={() => journeysQuery.refetch()}
                />
              ))}
            </div>

            {opportunitiesQuery.hasNextPage && (
              <div className="mt-6 flex justify-center">
                <Button
                  type="button"
                  variant="secondary"
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

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
