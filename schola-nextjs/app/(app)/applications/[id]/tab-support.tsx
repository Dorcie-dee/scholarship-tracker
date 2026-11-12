import type { ReactNode } from 'react';
import { AlertCircleIcon } from '@/components/icons';
import { iconButtonVariants } from '@/components/ui/button';

/** Small inline spinner — same visual language as `AppShell`'s full-page one, scaled down for in-panel use. */
export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-ink-soft" role="status">
      <span className="h-4 w-4 flex-none animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden="true" />
      {label}
    </div>
  );
}

export function TabError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
      <AlertCircleIcon size={18} className="mt-0.5 flex-none" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function TabEmpty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-ink-soft">{children}</p>;
}

/** A per-item row's trailing action cluster — keeps icon-only buttons' spacing/sizing consistent across tabs. */
export function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-none items-center gap-1">{children}</div>;
}

/** Thin alias over the shared `iconButtonVariants()` — kept so the five tab files importing this don't need to change. */
export function iconButtonClass(tone: 'neutral' | 'danger' = 'neutral'): string {
  return iconButtonVariants({ tone });
}
