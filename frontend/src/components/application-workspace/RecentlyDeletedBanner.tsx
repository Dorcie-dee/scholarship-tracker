'use client';

import { App, Button } from 'antd';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  readRecentlyDeleted,
  removeRecentlyDeleted,
  type RecentlyDeletedApplication,
} from '@/components/application-workspace/OverviewTab';
import { useRestoreApplication } from '@/lib/queries';
import { friendlyApiMessage } from '@/lib/user-errors';

/** Session-local list of soft-deleted apps the user can restore from this journey. */
export function RecentlyDeletedBanner({ journeyId }: { journeyId: string }) {
  const { message } = App.useApp();
  const router = useRouter();
  const restore = useRestoreApplication(journeyId);
  const [revision, setRevision] = useState(0);
  const items = readRecentlyDeleted(journeyId);
  // revision forces a re-read after stash mutations in this session
  void revision;

  const refresh = () => setRevision((n) => n + 1);

  if (items.length === 0) return null;

  const onRestore = async (entry: RecentlyDeletedApplication) => {
    try {
      await restore.mutateAsync(entry.id);
      removeRecentlyDeleted(entry.id);
      refresh();
      message.success(`Restored “${entry.title}”`);
      router.push(`/applications/${entry.id}`);
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not restore application'));
      removeRecentlyDeleted(entry.id);
      refresh();
    }
  };

  const onDismiss = (id: string) => {
    removeRecentlyDeleted(id);
    refresh();
  };

  return (
    <section
      className="rounded-[calc(var(--radius)-4px)] border px-4 py-3 space-y-2"
      style={{
        borderColor: 'color-mix(in srgb, var(--accent) 30%, var(--border))',
        background: 'color-mix(in srgb, var(--accent) 6%, var(--surface))',
      }}
      aria-label="Recently removed applications"
    >
      <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--accent)]">
        Recently removed
      </p>
      {items.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center justify-between gap-3 flex-wrap"
        >
          <p className="m-0 text-sm text-[color:var(--ink)]">{entry.title}</p>
          <div className="flex gap-2">
            <Button
              size="small"
              type="primary"
              loading={restore.isPending}
              onClick={() => void onRestore(entry)}
            >
              Restore
            </Button>
            <Button size="small" onClick={() => onDismiss(entry.id)}>
              Dismiss
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
