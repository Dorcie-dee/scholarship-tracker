import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { CheckIcon } from '@/components/icons';

interface CheckToggleProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  checked: boolean;
  /** Required — this is an icon-only control. e.g. "Mark \"Book IELTS exam\" as done" */
  'aria-label': string;
}

export function CheckToggle({ checked, className, ...props }: CheckToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      className={cn(
        'flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 transition-colors',
        checked
          ? 'border-primary bg-primary text-white'
          : 'border-line bg-surface text-transparent hover:border-primary/50',
        className,
      )}
      {...props}
    >
      <CheckIcon size={12} strokeWidth={3} aria-hidden="true" />
    </button>
  );
}
