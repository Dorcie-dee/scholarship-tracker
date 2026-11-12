'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, friendlyErrorMessage } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatDate, relativeDays } from '@/lib/status';
import { Button, iconButtonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldError, Input, Label } from '@/components/ui/form';
import { Pill } from '@/components/ui/pill';
import { AlertCircleIcon, LogOutIcon, PencilIcon, TrashIcon } from '@/components/icons';

interface FullUser {
  id: string;
  name: string | null;
  email: string;
  role: 'user' | 'admin';
  isVerified: boolean;
  createdAt: string;
}

interface Session {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  userAgent: string | null;
  ipAddress: string | null;
}

/** Very light UA summary so the list reads as "Chrome on macOS" instead of a raw UA string. */
function describeUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /chrome\//i.test(ua)
      ? 'Chrome'
      : /firefox\//i.test(ua)
        ? 'Firefox'
        : /safari\//i.test(ua)
          ? 'Safari'
          : 'A browser';
  const os = /windows/i.test(ua)
    ? 'Windows'
    : /mac os|macintosh/i.test(ua)
      ? 'macOS'
      : /android/i.test(ua)
        ? 'Android'
        : /iphone|ipad/i.test(ua)
          ? 'iOS'
          : 'an unknown OS';
  return `${browser} on ${os}`;
}

export default function SettingsPage() {
  const { user, setUser, logout } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const userQuery = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => apiFetch<FullUser>('/users/me'),
  });

  const sessionsQuery = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => apiFetch<Session[]>('/auth/sessions'),
  });

  // --- Name editing (PATCH /users/me) ---
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const nameMutation = useMutation({
    mutationFn: (name: string) => apiFetch<FullUser>('/users/me', { method: 'PATCH', body: { name } }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['users', 'me'], updated);
      if (user) setUser({ ...user, name: updated.name });
      setEditingName(false);
    },
    onError: (err) => setNameError(friendlyErrorMessage(err)),
  });

  // --- Sign out everywhere (POST /auth/logout-all) ---
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const signOutAllMutation = useMutation({
    mutationFn: () => apiFetch<void>('/auth/logout-all', { method: 'POST' }),
    onSuccess: async () => {
      // The refresh session backing our own access token was just revoked
      // server-side too — clear local auth state the same way a normal
      // logout does, then send the person to the login screen.
      await logout();
      router.push('/login');
    },
    onError: (err) => setSignOutError(friendlyErrorMessage(err)),
  });

  // --- Delete account (DELETE /users/me) ---
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteMutation = useMutation({
    mutationFn: () => apiFetch<void>('/users/me', { method: 'DELETE' }),
    onSuccess: async () => {
      await logout();
      router.push('/login');
    },
    onError: (err) => setDeleteError(friendlyErrorMessage(err)),
  });

  const canDelete = deleteConfirmation.trim().toLowerCase() === 'delete';

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <div>
        <h1 className="font-display text-page-title font-semibold text-ink sm:text-page-title-lg">Account settings</h1>
        <p className="mt-1.5 text-supporting text-ink-soft">Manage your account, active sessions, and data.</p>
      </div>

      {/* Account info */}
      <Card className="mt-6 p-5 sm:p-6">
        <h2 className="font-display text-card-title font-semibold text-ink">Account</h2>

        {userQuery.isLoading ? (
          <dl className="mt-4 flex flex-col divide-y divide-line-soft" aria-busy="true" aria-label="Loading account details">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="h-3.5 w-24 animate-pulse rounded bg-line-soft" />
                <div className="h-3.5 w-32 animate-pulse rounded bg-line-soft" />
              </div>
            ))}
          </dl>
        ) : userQuery.isError ? (
          <div className="mt-3 flex flex-col items-start gap-3">
            <p className="text-sm text-danger">{friendlyErrorMessage(userQuery.error)}</p>
            <Button size="sm" variant="secondary" onClick={() => userQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          userQuery.data && (
            <dl className="mt-4 flex flex-col divide-y divide-line-soft">
              <div className="flex items-center justify-between gap-3 py-3 first:pt-0">
                <dt className="text-sm font-semibold text-ink-soft">Name</dt>
                <dd className="flex items-center gap-2 text-sm text-ink">
                  {editingName ? (
                    <form
                      className="flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        setNameError(null);
                        nameMutation.mutate(nameDraft.trim());
                      }}
                    >
                      <Label htmlFor="settings-name" className="sr-only">
                        Name
                      </Label>
                      <Input
                        id="settings-name"
                        autoFocus
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        className="h-9 w-44"
                      />
                      <Button type="submit" size="sm" disabled={nameMutation.isPending}>
                        {nameMutation.isPending ? 'Saving…' : 'Save'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditingName(false);
                          setNameError(null);
                        }}
                        disabled={nameMutation.isPending}
                      >
                        Cancel
                      </Button>
                    </form>
                  ) : (
                    <>
                      <span>{userQuery.data.name || 'Not set'}</span>
                      <button
                        type="button"
                        aria-label="Edit name"
                        onClick={() => {
                          setNameDraft(userQuery.data.name ?? '');
                          setEditingName(true);
                        }}
                        className={iconButtonVariants()}
                      >
                        <PencilIcon size={14} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </dd>
              </div>
              {editingName && <FieldError>{nameError}</FieldError>}

              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="text-sm font-semibold text-ink-soft">Email</dt>
                <dd className="text-sm text-ink">{userQuery.data.email}</dd>
              </div>

              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="text-sm font-semibold text-ink-soft">Member since</dt>
                <dd className="text-sm text-ink">{formatDate(userQuery.data.createdAt)}</dd>
              </div>

              <div className="flex items-center justify-between gap-3 py-3 last:pb-0">
                <dt className="text-sm font-semibold text-ink-soft">Verification</dt>
                <dd>
                  <Pill tone={userQuery.data.isVerified ? 'success' : 'warning'}>
                    {userQuery.data.isVerified ? 'Verified' : 'Not verified'}
                  </Pill>
                </dd>
              </div>
            </dl>
          )
        )}
        <p className="mt-4 text-xs text-ink-faint">
          Your email address can't be changed here. There's no password-change flow yet either — use "Forgot
          password" on the login screen to reset it by email.
        </p>
      </Card>

      {/* Active sessions */}
      <Card className="mt-6 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-card-title font-semibold text-ink">Active sessions</h2>
            <p className="mt-0.5 text-sm text-ink-soft">Devices currently signed in to your account.</p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {sessionsQuery.isLoading ? (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading sessions">
              {[0, 1].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg border border-line-soft bg-line-soft/40" />
              ))}
            </div>
          ) : sessionsQuery.isError ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-danger">{friendlyErrorMessage(sessionsQuery.error)}</p>
              <Button size="sm" variant="secondary" onClick={() => sessionsQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : sessionsQuery.data && sessionsQuery.data.length > 0 ? (
            sessionsQuery.data.map((session) => (
              <div key={session.id} className="rounded-lg border border-line-soft px-4 py-3">
                <p className="text-sm font-semibold text-ink">{describeUserAgent(session.userAgent)}</p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {session.ipAddress ?? 'Unknown location'} · Last used {relativeDays(session.lastUsedAt) || formatDate(session.lastUsedAt)}
                </p>
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-ink-faint">
              No active sessions found.
            </p>
          )}
        </div>

        <div className="mt-4 border-t border-line pt-4">
          <Button
            variant="secondary"
            onClick={() => {
              setSignOutError(null);
              signOutAllMutation.mutate();
            }}
            disabled={signOutAllMutation.isPending}
          >
            <LogOutIcon size={16} aria-hidden="true" />
            {signOutAllMutation.isPending ? 'Signing out…' : 'Sign out of all devices'}
          </Button>
          <p className="mt-2 text-xs text-ink-faint">
            This revokes every session at once (there's no way to sign out a single device individually) — you'll
            be signed out here too.
          </p>
          <FieldError>{signOutError}</FieldError>
        </div>
      </Card>

      {/* Danger zone */}
      <Card className="mt-6 border-danger/30 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-danger-soft text-danger">
            <AlertCircleIcon size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-card-title font-semibold text-ink">Danger zone</h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              Deleting your account permanently erases your profile, applications, tasks, requirements, deadlines,
              uploaded documents, and login sessions. This happens immediately and can't be undone.
            </p>
          </div>
        </div>

        {!deleteOpen ? (
          <Button
            variant="danger"
            className="mt-4"
            onClick={() => {
              setDeleteOpen(true);
              setDeleteConfirmation('');
              setDeleteError(null);
            }}
          >
            <TrashIcon size={16} aria-hidden="true" />
            Delete my account
          </Button>
        ) : (
          <form
            className="mt-4 rounded-lg border border-danger/30 bg-danger-soft/40 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!canDelete) return;
              setDeleteError(null);
              deleteMutation.mutate();
            }}
          >
            <Label htmlFor="delete-confirm">
              Type <span className="font-mono font-bold">delete</span> to confirm you understand this is permanent
              and immediate.
            </Label>
            <Input
              id="delete-confirm"
              autoFocus
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder="delete"
              autoComplete="off"
            />
            <FieldError>{deleteError}</FieldError>
            <div className="mt-3 flex items-center gap-2">
              <Button type="submit" variant="danger" disabled={!canDelete || deleteMutation.isPending}>
                {deleteMutation.isPending ? 'Deleting…' : 'Permanently delete my account'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDeleteOpen(false)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
