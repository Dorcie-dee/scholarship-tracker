import { cn } from '@/lib/cn';

interface ProgressBarProps {
  value: number;
  tone?: 'primary' | 'accent';
  className?: string;
}

/**
 * The fill width is a continuous runtime value Tailwind's static class
 * scanner can't generate ahead of time — this is the one spot in the app
 * where an inline style is the correct tool, not a shortcut around Tailwind.
 */
export function ProgressBar({ value, tone = 'primary', className }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-line-soft', className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full transition-all duration-300', tone === 'accent' ? 'bg-accent' : 'bg-primary')}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
