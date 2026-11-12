'use client';

import { SearchOutlined } from '@ant-design/icons';
import { App, Button, Input, Modal, Select, Tag } from 'antd';
import { useDeferredValue, useState } from 'react';
import { CursorPager } from '@/components/CursorPager';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ListSkeleton } from '@/components/LoadingSkeleton';
import { useAuth } from '@/lib/auth-context';
import { flattenPages, useUpdateUserRole, useUsers } from '@/lib/queries';
import { UserRole } from '@/lib/shared-types';
import type { AdminDirectoryUser } from '@/lib/types';
import { friendlyApiMessage } from '@/lib/user-errors';

const ROLE_OPTIONS = [
  { value: UserRole.USER, label: 'User' },
  { value: UserRole.ADMIN, label: 'Admin' },
];

function roleLabel(role: UserRole): string {
  return role === UserRole.ADMIN ? 'Admin' : 'User';
}

/**
 * Profile → Account admin tool: searchable user directory + role change.
 * Visibility uses JWT role; enforcement stays on the backend.
 */
export function AdminUserRoleSection() {
  const { user: currentUser } = useAuth();
  const { message } = App.useApp();
  const updateRole = useUpdateUserRole();

  const [searchInput, setSearchInput] = useState('');
  const deferredSearch = useDeferredValue(searchInput.trim());
  const [roleFilter, setRoleFilter] = useState<UserRole | undefined>(undefined);
  const [selected, setSelected] = useState<AdminDirectoryUser | null>(null);
  const [newRole, setNewRole] = useState<UserRole>(UserRole.USER);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isLoading, isError, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useUsers({
      search: deferredSearch || undefined,
      role: roleFilter,
    });
  const users = flattenPages(data?.pages);

  const isSelf = (id: string) => currentUser?.id === id;
  const canSubmit =
    selected !== null &&
    !isSelf(selected.id) &&
    newRole !== selected.role &&
    !updateRole.isPending;

  const openConfirm = () => {
    if (!selected || isSelf(selected.id) || newRole === selected.role) return;
    setConfirmOpen(true);
  };

  const applyRoleChange = async () => {
    if (!selected || isSelf(selected.id)) return;
    try {
      const updated = await updateRole.mutateAsync({ id: selected.id, role: newRole });
      message.success(
        `Role updated to ${roleLabel(updated.role)} for ${updated.email ?? selected.email}`,
      );
      setSelected({
        ...selected,
        role: updated.role,
        name: updated.name,
        email: updated.email,
        isVerified: updated.isVerified,
      });
      setNewRole(updated.role);
      setConfirmOpen(false);
    } catch (err) {
      // Backend uses 400 for last-admin (not 409); friendlyApiMessage surfaces either.
      message.error(friendlyApiMessage(err, 'Could not update role'));
    }
  };

  return (
    <section className="surface overflow-hidden">
      <div className="px-5 py-4 border-b border-[color:var(--border)]">
        <h3
          className="m-0 text-[15px] font-semibold text-[color:var(--ink)]"
          style={{ fontFamily: 'var(--font-display), sans-serif' }}
        >
          Admin — change user role
        </h3>
      </div>
      <div className="p-5 space-y-4">
        <p className="m-0 text-sm text-[color:var(--text-secondary)] leading-relaxed">
          Search the account directory, select a user, and change their role. You cannot change your
          own role, and the last remaining admin cannot be demoted.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            allowClear
            size="large"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or email"
            prefix={<SearchOutlined className="text-[color:var(--text-muted)]" aria-hidden />}
            aria-label="Search users by name or email"
            autoComplete="off"
            className="flex-1 min-w-0"
          />
          <Select
            allowClear
            placeholder="All roles"
            value={roleFilter}
            onChange={(value: UserRole | undefined) => setRoleFilter(value)}
            options={ROLE_OPTIONS}
            className="sm:!w-40"
            size="large"
            aria-label="Filter by role"
          />
        </div>

        {isLoading ? (
          <ListSkeleton rows={4} />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} title="Could not load users" />
        ) : users.length === 0 ? (
          <EmptyState
            title={
              deferredSearch || roleFilter
                ? 'No users match these filters'
                : 'No users found'
            }
            description={
              deferredSearch || roleFilter
                ? 'Try a different search or clear the role filter.'
                : undefined
            }
          />
        ) : (
          <>
            <ul
              className="m-0 p-0 list-none space-y-2"
              role="listbox"
              aria-label="User directory"
              aria-activedescendant={selected ? `user-option-${selected.id}` : undefined}
            >
              {users.map((u) => {
                const self = isSelf(u.id);
                const isSelected = selected?.id === u.id;
                return (
                  <li key={u.id} role="presentation">
                    <button
                      type="button"
                      id={`user-option-${u.id}`}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={self}
                      disabled={self}
                      onClick={() => {
                        if (self) return;
                        setSelected(u);
                        setNewRole(u.role === UserRole.ADMIN ? UserRole.USER : UserRole.ADMIN);
                      }}
                      className={[
                        'w-full text-left rounded-lg border px-4 py-3 transition-colors',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40',
                        self
                          ? 'border-[color:var(--border)] bg-[color:var(--canvas)] opacity-70 cursor-not-allowed'
                          : isSelected
                            ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]'
                            : 'border-[color:var(--border)] bg-[color:var(--surface)] hover:border-[color:var(--accent)]/50',
                      ].join(' ')}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="m-0 text-sm font-semibold text-[color:var(--ink)] truncate">
                            {u.name?.trim() || 'Unnamed account'}
                            {self ? (
                              <span className="ml-2 text-xs font-medium text-[color:var(--text-muted)]">
                                (you)
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 mb-0 text-sm text-[color:var(--text-secondary)] truncate">
                            {u.email}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 shrink-0">
                          <Tag color={u.role === UserRole.ADMIN ? 'geekblue' : 'default'}>
                            {roleLabel(u.role)}
                          </Tag>
                          <Tag color={u.isVerified ? 'success' : 'warning'}>
                            {u.isVerified ? 'Verified' : 'Unverified'}
                          </Tag>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            <CursorPager
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={() => fetchNextPage()}
            />
          </>
        )}

        {selected && !isSelf(selected.id) ? (
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--canvas)] p-4 space-y-3">
            <div>
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                Selected
              </p>
              <p className="mt-1 mb-0 text-sm font-medium text-[color:var(--ink)]">
                {selected.name?.trim() || 'Unnamed account'} · {selected.email}
              </p>
              <p className="mt-1 mb-0 text-sm text-[color:var(--text-secondary)]">
                Current role: <strong>{roleLabel(selected.role)}</strong>
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <label className="flex-1 min-w-0 space-y-1.5">
                <span className="block text-sm text-[color:var(--text-secondary)]">New role</span>
                <Select
                  size="large"
                  className="w-full"
                  value={newRole}
                  onChange={(value: UserRole) => setNewRole(value)}
                  options={ROLE_OPTIONS}
                  aria-label="New role"
                />
              </label>
              <Button type="primary" size="large" disabled={!canSubmit} onClick={openConfirm}>
                Change role
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <Modal
        title="Confirm role change"
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onOk={() => void applyRoleChange()}
        okText="Confirm"
        confirmLoading={updateRole.isPending}
        destroyOnHidden
      >
        {selected ? (
          <p className="m-0 text-sm text-[color:var(--text-secondary)] leading-relaxed">
            Change <strong>{selected.name?.trim() || selected.email}</strong> from{' '}
            <strong>{roleLabel(selected.role)}</strong> to <strong>{roleLabel(newRole)}</strong>?
          </p>
        ) : null}
      </Modal>
    </section>
  );
}
