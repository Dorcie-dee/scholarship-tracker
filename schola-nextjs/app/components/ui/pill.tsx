import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type PillTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'accent';

/** Exported so a control that needs pill *coloring* without the `<span>` itself (e.g. an editable status `<select>`) can reuse the same tone map. */
export const PILL_TONE_CLASSES: Record<PillTone, string> = {
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-line-soft text-ink-soft',
  accent: 'bg-accent-soft text-accent',
};

interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
}

export function Pill({ tone = 'neutral', className, ...props }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
        PILL_TONE_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}
