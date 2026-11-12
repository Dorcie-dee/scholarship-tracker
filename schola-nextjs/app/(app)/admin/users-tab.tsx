'use client';

import { useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, friendlyErrorMessage } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/status';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Input, Label } from '@/components/ui/form';
import { Pill } from '@/components/ui/pill';
import { SearchIcon } from '@/components/icons';
import { useDebouncedValue } from '@/components/discover/use-debounced-value';
import { EmptyState, ErrorState, TableShell, TableSkeleton } from './admin-table';
import type { AdminUser, AdminUserDirectoryPage } from './types';

const PAGE_SIZE = 20;
const SELECT_CLASSES =
  'h-11 rounded-lg border border-line bg-surface px-3.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

export function UsersTab() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput.trim(), 300);
  const [roleFilter, setRoleFilter] = useState('');
  const [bannerError, setBannerError] = useState<string | null>(null);

  const usersQuery = useInfiniteQuery({
    queryKey: ['admin', 'users', search, roleFilter],
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiFetch<AdminUserDirectoryPage>(
        `/users?limit=${PAGE_SIZE}&search=${encodeURIComponent(search)}${roleFilter ? `&role=${roleFilter}` : ''}${
          pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''
        }`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasNextPage ? (last.nextCursor ?? undefined) : undefined),
  });

  const users = useMemo(() => usersQuery.data?.pages.flatMap((p) => p.items) ?? [], [usersQuery.data]);

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'user' | 'admin' }) =>
      apiFetch<AdminUser>(`/users/${id}/role`, { method: 'PATCH', body: { role } }),
    onSuccess: () => {
      setBannerError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err: unknown) => setBannerError(friendlyErrorMessage(err)),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <SearchIcon
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
            aria-hidden="true"
          />
          <Label htmlFor="user-search" className="sr-only">
            Search users
          </Label>
          <Input
            id="user-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or email"
            className="pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
          Role
          <select className={SELECT_CLASSES} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">All</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>
      </div>

      {bannerError && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger">
          <span>{bannerError}</span>
          <button type="button" onClick={() => setBannerError(null)} className="font-semibold underline underline-offset-2">
            Dismiss
          </button>
        </div>
      )}

      {usersQuery.isLoading ? (
        <TableSkeleton />
      ) : usersQuery.isError ? (
        <ErrorState message={friendlyErrorMessage(usersQuery.error)} onRetry={() => usersQuery.refetch()} />
      ) : users.length === 0 ? (
        <EmptyState label={search || roleFilter ? 'No users match these filters.' : 'No users yet.'} />
      ) : (
        <>
          <TableShell>
            <thead>
              <tr className="border-b border-line bg-line-soft/40 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                <th scope="col" className="px-4 py-3">
                  Name
                </th>
                <th scope="col" className="px-4 py-3">
                  Email
                </th>
                <th scope="col" className="px-4 py-3">
                  Role
                </th>
                <th scope="col" className="px-4 py-3">
                  Verified
                </th>
                <th scope="col" className="px-4 py-3">
                  Created
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                const targetRole: 'user' | 'admin' = u.role === 'admin' ? 'user' : 'admin';
                return (
                  <tr key={u.id} className="border-b border-line-soft last:border-0">
                    <td className="px-4 py-3 text-sm font-semibold text-ink">{u.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-ink-soft">{u.email}</td>
                    <td className="px-4 py-3 text-sm">
                      <Pill tone={u.role === 'admin' ? 'accent' : 'neutral'}>{u.role === 'admin' ? 'Admin' : 'User'}</Pill>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Pill tone={u.isVerified ? 'success' : 'warning'}>{u.isVerified ? 'Verified' : 'Unverified'}</Pill>
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-soft">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <ConfirmAction
                          prompt={
                            targetRole === 'admin'
                              ? `Grant admin to ${u.name ?? u.email}?`
                              : `Revoke admin from ${u.name ?? u.email}?`
                          }
                          confirmLabel={targetRole === 'admin' ? 'Grant admin' : 'Revoke admin'}
                          onConfirm={() => roleMutation.mutate({ id: u.id, role: targetRole })}
                          disabled={roleMutation.isPending}
                        >
                          {(start) => (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={start}
                              disabled={isSelf || roleMutation.isPending}
                              title={isSelf ? 'You cannot change your own role' : undefined}
                            >
                              {targetRole === 'admin' ? 'Make admin' : 'Revoke admin'}
                            </Button>
                          )}
                        </ConfirmAction>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
          {usersQuery.hasNextPage && (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => usersQuery.fetchNextPage()}
                disabled={usersQuery.isFetchingNextPage}
              >
                {usersQuery.isFetchingNextPage ? 'Loading more…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
