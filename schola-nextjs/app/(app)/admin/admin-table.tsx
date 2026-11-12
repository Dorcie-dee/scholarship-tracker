import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Minimal shared table shell for the admin tabs — each tab's columns and row
 * shape differ too much to generalize further, but the scroll-on-narrow-
 * screens wrapper (per this codebase's convention: `overflow-x-auto` on a
 * bounded box rather than letting a table silently clip) and loading/error/
 * empty states are identical everywhere, so they live here once.
 */
export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-line-soft" />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface p-8 text-center">
      <p className="text-sm font-medium text-danger">{message}</p>
      <Button size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink-faint">
      {label}
    </div>
  );
}
