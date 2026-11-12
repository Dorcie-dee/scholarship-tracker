'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { UsersTab } from './users-tab';

/**
 * Admin console — user-role management only. Universities, Programmes and
 * Opportunities used to be a shared catalog admins curated here; they are
 * now personal workspace data owned by whichever user created them (see
 * `docs/decisions.md`, "Catalog data vs. owned data (superseded)"), so
 * there is no longer a shared catalog for an admin to manage. The backend's
 * `withRoute({ roles: [UserRole.ADMIN] })` on `/users/:id/role` is the real
 * authorization boundary; the redirect below only keeps a non-admin from
 * seeing this screen at all, matching `AppShell`'s own status-based
 * redirect pattern in `app/components/layout/app-shell.tsx`.
 */
export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (user && !isAdmin) {
      router.replace('/dashboard');
    }
  }, [user, isAdmin, router]);

  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary"
          role="status"
          aria-label="Loading"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-5 sm:p-8">
      <div>
        <h1 className="font-display text-page-title font-semibold text-ink sm:text-page-title-lg">Admin</h1>
        <p className="mt-1.5 text-supporting text-ink-soft">Manage user roles across Schola.</p>
      </div>

      <UsersTab />
    </div>
  );
}
