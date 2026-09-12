'use client';

import { Button } from 'antd';
import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="surface py-14 px-6 text-center animate-fade">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M8 9.5h8M8 13h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="m-0 text-base font-semibold text-[color:var(--ink)]">{title}</h3>
      {description && (
        <p className="mt-2 mb-0 mx-auto max-w-md text-sm text-[color:var(--text-secondary)] leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <Button type="primary" className="!mt-5" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function EmptyStateInline({ children }: { children: ReactNode }): ReactNode {
  return <div className="text-sm text-[color:var(--text-muted)] py-2">{children}</div>;
}
