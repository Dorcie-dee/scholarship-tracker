'use client';

import Link from 'next/link';

type BrandMarkProps = {
  href?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'light' | 'dark' | 'on-dark';
  showWordmark?: boolean;
  className?: string;
};

const SIZE = {
  sm: { mark: 'h-7 w-7 text-[11px]', word: 'text-[15px]' },
  md: { mark: 'h-8 w-8 text-sm', word: 'text-base' },
  lg: { mark: 'h-10 w-10 text-base', word: 'text-xl' },
} as const;

/**
 * Product mark — geometric S on a teal tile. Used in shell, auth, and marketing.
 */
export function BrandMark({
  href = '/',
  size = 'md',
  variant = 'dark',
  showWordmark = true,
  className = '',
}: BrandMarkProps) {
  const s = SIZE[size];
  const wordColor =
    variant === 'on-dark'
      ? 'text-white'
      : variant === 'light'
        ? 'text-white'
        : 'text-[color:var(--ink)]';

  const inner = (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className={`${s.mark} shrink-0 rounded-[9px] bg-[color:var(--accent)] text-white font-bold flex items-center justify-center shadow-[0_1px_2px_rgba(14,116,144,0.35)]`}
        aria-hidden
      >
        S
      </span>
      {showWordmark && (
        <span className={`${s.word} font-semibold tracking-tight ${wordColor}`}>
          Scholarship <span className="font-medium opacity-80">OS</span>
        </span>
      )}
    </span>
  );

  if (!href) return inner;

  return (
    <Link href={href} className="inline-flex no-underline hover:opacity-90 transition-opacity">
      {inner}
    </Link>
  );
}
