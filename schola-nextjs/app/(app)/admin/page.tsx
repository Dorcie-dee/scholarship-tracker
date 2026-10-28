'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/cn';
import { UniversitiesTab } from './universities-tab';
import { ProgrammesTab } from './programmes-tab';
import { OpportunitiesTab } from './opportunities-tab';
import { UsersTab } from './users-tab';

const TABS = [
  { key: 'universities', label: 'Universities' },
  { key: 'programmes', label: 'Programmes' },
  { key: 'opportunities', label: 'Opportunities' },
  { key: 'users', label: 'Users' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/**
 * Admin console for the catalog (Universities/Programmes/Opportunities) and
 * user-role management. Tabs are local state, not routes — the backend's
 * `withRoute({ roles: [UserRole.ADMIN] })` on every mutating endpoint is the
 * real authorization boundary; the redirect below only keeps a non-admin
 * from seeing these controls at all, matching `AppShell`'s own
 * status-based redirect pattern in `app/components/layout/app-shell.tsx`.
 */
export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('universities');

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
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Admin</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          Manage the shared catalog and user roles. Changes here affect every Schola user.
        </p>
      </div>

      <div role="tablist" aria-label="Admin sections" className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`admin-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`admin-panel-${t.key}`}
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors',
              tab === t.key
                ? 'border-b-2 border-primary text-primary'
                : 'border-b-2 border-transparent text-ink-soft hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`admin-panel-${tab}`}
        aria-labelledby={`admin-tab-${tab}`}
        className="flex flex-col gap-4"
      >
        {tab === 'universities' && <UniversitiesTab />}
        {tab === 'programmes' && <ProgrammesTab />}
        {tab === 'opportunities' && <OpportunitiesTab />}
        {tab === 'users' && <UsersTab />}
      </div>
    </div>
  );
}
