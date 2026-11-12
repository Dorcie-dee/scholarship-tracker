'use client';

import { useEffect } from 'react';
import { cn } from '@/lib/cn';
import { AlertCircleIcon, CheckIcon, SparklesIcon } from '@/components/icons';

export interface ToastState {
  message: string;
  tone: 'success' | 'error' | 'info';
}

/**
 * A single, transient, non-blocking notification — the "lightweight
 * confirm/toast, not a blocking modal" the one-journey "start application"
 * fast path calls for. The page owns the `ToastState | null` and clears it
 * after a few seconds; this component just renders it.
 */
export function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const Icon = toast.tone === 'success' ? CheckIcon : toast.tone === 'info' ? SparklesIcon : AlertCircleIcon;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-sm items-start gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-medium text-ink shadow-popover sm:inset-x-auto sm:right-6"
    >
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full',
          toast.tone === 'success' && 'bg-success-soft text-success',
          toast.tone === 'info' && 'bg-info-soft text-info',
          toast.tone === 'error' && 'bg-danger-soft text-danger',
        )}
      >
        <Icon size={13} aria-hidden="true" />
      </span>
      <p className="flex-1">{toast.message}</p>
    </div>
  );
}
