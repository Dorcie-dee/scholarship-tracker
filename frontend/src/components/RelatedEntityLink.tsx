'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

export function RelatedEntityLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="font-medium text-[color:var(--accent)] hover:text-[color:var(--accent-hover)] underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}
