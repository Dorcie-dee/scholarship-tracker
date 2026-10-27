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
    primary: 'bg-primary text-white hover:bg-primary-hover',
    secondary: 'border border-line bg-surface text-ink hover:border-ink-faint',
    ghost: 'text-primary hover:bg-primary-soft',
    danger: 'bg-danger text-white hover:bg-danger/90',
  };
  return cn(base, sizes[size], variants[variant], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant, size, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonVariants({ variant, size, className })} {...props} />;
}
