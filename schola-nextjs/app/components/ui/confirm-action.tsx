'use client';

import { useState } from 'react';
import { Button } from './button';

interface ConfirmActionProps {
  /** Short question shown in place of the trigger while confirming, e.g. "Delete this requirement?" */
  prompt: string;
  confirmLabel?: string;
  disabled?: boolean;
  onConfirm: () => void;
  /** Receives `startConfirm` to wire onto the real trigger (a button, an icon button, a row of them). */
  children: (startConfirm: () => void) => React.ReactNode;
}

/**
 * Replaces a destructive action's trigger with an inline "are you sure"
 * bar, on-brand with the rest of the app, instead of a native
 * `window.confirm()` dialog (which breaks the custom design and can't be
 * styled or made consistent with it). Mirrors the pattern already proven in
 * `app/(app)/profile/list-section.tsx`'s row remove-confirm, generalized so
 * every destructive action in the app can share one implementation instead
 * of a third one being hand-rolled.
 */
export function ConfirmAction({ prompt, confirmLabel = 'Delete', disabled, onConfirm, children }: ConfirmActionProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex flex-none items-center gap-2">
        <span className="text-xs font-medium text-danger">{prompt}</span>
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setConfirming(false);
            onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return <>{children(() => setConfirming(true))}</>;
}
