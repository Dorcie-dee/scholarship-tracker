import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { flattenPages } from '@/lib/queries';
import { UserRole } from '@/lib/shared-types';
import type { PaginatedResult } from '@/lib/types';

describe('flattenPages', () => {
  it('returns an empty array for undefined pages (query not yet loaded)', () => {
    expect(flattenPages(undefined)).toEqual([]);
  });

  it("flattens every page's items in order, dropping the pagination envelope", () => {
    const pages: PaginatedResult<{ id: number }>[] = [
      { items: [{ id: 1 }, { id: 2 }], nextCursor: 'a', hasNextPage: true },
      { items: [{ id: 3 }], nextCursor: null, hasNextPage: false },
    ];
    expect(flattenPages(pages)).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });
});

const { apiDelete, apiGet, apiPatch } = vi.hoisted(() => ({
  apiDelete: vi.fn(async () => undefined),
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiDelete,
    apiGet,
    apiPatch,
  };
});

/**
 * Track 2 §0 regression coverage at the frontend layer: after a soft-delete
 * mutation succeeds, the Application's own cached detail entry must be
 * dropped entirely (not just marked stale) — otherwise a route that reads
 * it straight from cache could still render a since-deleted Application for
 * an instant. Exercises the REAL useDeleteApplication hook, not a
 * hand-rolled imitation of it.
 */
describe('useDeleteApplication (Track 2 §0)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    apiDelete.mockClear();
  });

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  it("removes the deleted application's cached detail entry on success", async () => {
    const { useDeleteApplication } = await import('@/lib/queries');
    const applicationId = 'app-1';
    const journeyId = 'journey-1';
    queryClient.setQueryData(['applications', applicationId], { id: applicationId, title: 'To delete' });

    const { result } = renderHook(() => useDeleteApplication(journeyId), { wrapper });
    result.current.mutate(applicationId);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(['applications', applicationId])).toBeUndefined();
  });
});

describe('useUsers + useUpdateUserRole (admin directory)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    apiGet.mockReset();
    apiPatch.mockReset();
  });

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  it('calls GET /users with filters and limit (keyset page, not a full dump)', async () => {
    apiGet.mockResolvedValue({ items: [], nextCursor: null, hasNextPage: false });
    const { useUsers } = await import('@/lib/queries');

    const { result } = renderHook(
      () => useUsers({ search: 'blake', role: UserRole.USER }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiGet).toHaveBeenCalledWith(
      expect.stringMatching(/^\/users\?.*search=blake.*role=user.*limit=20/),
    );
  });

  it('invalidates users queries after a successful role change', async () => {
    apiPatch.mockResolvedValue({
      id: 'user-2',
      email: 'blake@example.com',
      name: 'Blake',
      role: UserRole.ADMIN,
      isVerified: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { useUpdateUserRole } = await import('@/lib/queries');

    const { result } = renderHook(() => useUpdateUserRole(), { wrapper });
    result.current.mutate({ id: 'user-2', role: UserRole.ADMIN });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiPatch).toHaveBeenCalledWith('/users/user-2/role', { role: UserRole.ADMIN });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'] });
  });
});
