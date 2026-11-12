import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

/**
 * Exposed separately from `Button` so a `next/link` that must *look* like a
 * button (navigating, not submitting) can share the exact same classes
 * instead of duplicating the style rules.
 */
export function buttonVariants({
  variant = 'primary',
  size = 'md',
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}): string {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors whitespace-nowrap disabled:pointer-events-none disabled:opacity-50';
  const sizes: Record<Size, string> = {
    md: 'h-11 px-5 text-sm',
    sm: 'h-8 px-3 text-xs',
  };
  const variants: Record<Variant, string> = {
    primary: 'bg-primary text-white hover:bg-primary-hover active:bg-primary-active',
    secondary: 'border border-line bg-surface text-ink hover:border-ink-faint active:bg-line-soft',
    ghost: 'text-primary hover:bg-primary-soft active:bg-primary-soft/80',
    danger: 'bg-danger text-white hover:bg-danger/90 active:bg-danger/80',
  };
  return cn(base, sizes[size], variants[variant], className);
}

type IconButtonTone = 'neutral' | 'danger';
type IconButtonSize = 'md' | 'lg';

/**
 * The one shared icon-only-button style — replaces three conventions that
 * had drifted apart (`tab-support.tsx`'s own `iconButtonClass`, a pair of
 * `ACTION_ICON_BUTTON`/`DANGER_ICON_BUTTON` constants in `admin-table.tsx`
 * that turned out to be unused anywhere, and several more copies inline in
 * individual pages — none with a dedicated focus ring, one as small as
 * 28px). `md` (36px) is for icon buttons packed into a dense row (list
 * actions, table rows) where a full 44px would blow out row height; `lg`
 * (44px) is for standalone/header-level buttons (a panel's close control)
 * where the full touch-target size is practical without a layout cost.
 */
export function iconButtonVariants({
  tone = 'neutral',
  size = 'md',
  className,
}: { tone?: IconButtonTone; size?: IconButtonSize; className?: string } = {}): string {
  const base =
    'inline-flex flex-none items-center justify-center rounded-lg text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-40';
  const sizes: Record<IconButtonSize, string> = {
    md: 'h-9 w-9',
    lg: 'h-11 w-11',
  };
  const tones: Record<IconButtonTone, string> = {
    neutral: 'hover:bg-line-soft hover:text-ink',
    danger: 'hover:bg-danger-soft hover:text-danger',
  };
  return cn(base, sizes[size], tones[tone], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant, size, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonVariants({ variant, size, className })} {...props} />;
}
