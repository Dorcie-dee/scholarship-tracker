'use client';

import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { iconButtonVariants } from './button';
import { XIcon } from '@/components/icons';

/**
 * The shared accessible drawer/sheet — a right-side panel from `sm` up, a
 * bottom sheet below it (see `.drawer-panel` in globals.css for the
 * breakpoint split). Built on native `<dialog>` + `showModal()` rather than
 * a new dependency: that alone gives top-layer rendering (the background
 * becomes genuinely inert, not just visually dimmed), a real `::backdrop`,
 * and native Escape-to-close. Every close path — the X button, a backdrop
 * click, or Escape — goes through `dialog.close()` so focus restoration
 * happens exactly once, the same way, regardless of how it was triggered.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  initialFocusRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Focused once the drawer opens; defaults to the close button. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      (initialFocusRef?.current ?? closeButtonRef.current)?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
    // Only `open` should re-trigger this — `initialFocusRef` is a stable ref object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleNativeClose = () => {
      previouslyFocused.current?.focus();
      onClose();
    };
    dialog.addEventListener('close', handleNativeClose);
    return () => dialog.removeEventListener('close', handleNativeClose);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  function requestClose() {
    dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      className="drawer-panel m-0 p-0"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={(e) => {
        if (e.target === dialogRef.current) requestClose();
      }}
    >
      <div className="flex h-full max-h-[inherit] flex-col">
        <div className="flex flex-none items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-section-heading font-semibold text-ink">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-ink-soft">
                {description}
              </p>
            )}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className={iconButtonVariants({ size: 'lg' })}
          >
            <XIcon size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </dialog>
  );
}
