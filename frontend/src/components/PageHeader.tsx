'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** Consistent page-top: optional back link + eyebrow + title + description + actions. */
export function PageHeader({
  title,
  description,
  extra,
  eyebrow,
  backHref,
  backLabel,
}: {
  title: string;
  description?: string;
  extra?: ReactNode;
  eyebrow?: string;
  /** When set, shows a clear “back” control above the title. */
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-7 flex-wrap animate-rise">
      <div className="min-w-0 max-w-2xl">
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 mb-3 text-sm font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--accent)] no-underline transition-colors"
          >
            <ArrowLeftOutlined className="text-xs" aria-hidden />
            {backLabel ?? 'Back'}
          </Link>
        )}
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--accent)] mb-2">
            {eyebrow}
          </p>
        )}
        <h1
          className="m-0 text-[1.65rem] sm:text-[1.85rem] font-semibold tracking-tight text-[color:var(--ink)] leading-tight"
          style={{ fontFamily: 'var(--font-display), var(--font-sans), sans-serif' }}
        >
          {title}
        </h1>
        {description && (
          <p className="mt-2 mb-0 text-[15px] text-[color:var(--text-secondary)] leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {extra && <div className="flex items-center gap-2 flex-wrap shrink-0">{extra}</div>}
    </div>
  );
}
