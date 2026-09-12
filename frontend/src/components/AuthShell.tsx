'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandMark } from '@/components/BrandMark';

/**
 * Shared frame for auth pages — split composition on desktop, stacked on mobile.
 */
export function AuthShell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <aside className="relative hidden lg:flex flex-col justify-between hero-atmosphere text-white p-10 xl:p-14 overflow-hidden">
        <div className="absolute inset-0 grid-fade pointer-events-none" />
        <div className="absolute -right-16 top-24 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl animate-drift" />
        <BrandMark href="/" variant="on-dark" size="md" className="relative z-10" />
        <div className="relative z-10 max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/80 mb-4">
            Scholarship OS
          </p>
          <h2
            className="m-0 text-4xl font-semibold leading-tight tracking-tight"
            style={{ fontFamily: 'var(--font-display), sans-serif' }}
          >
            Clarity for every application season.
          </h2>
          <p className="mt-4 mb-0 text-white/65 text-base leading-relaxed">
            Journeys, applications, documents, and deadlines — structured the way ambitious
            applicants actually work.
          </p>
        </div>
        <p className="relative z-10 text-sm text-white/40">Secure · Responsive · Production-ready</p>
      </aside>

      <div className="flex flex-col mesh-light">
        <div className="lg:hidden px-6 pt-8">
          <BrandMark href="/" size="md" />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-[400px] animate-rise">
            {(title || subtitle) && (
              <div className="mb-7">
                {title && (
                  <h1
                    className="m-0 text-2xl font-semibold text-[color:var(--ink)] tracking-tight"
                    style={{ fontFamily: 'var(--font-display), sans-serif' }}
                  >
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="mt-2 mb-0 text-[color:var(--text-secondary)] text-[15px] leading-relaxed">
                    {subtitle}
                  </p>
                )}
              </div>
            )}
            <div className="surface p-6 sm:p-8">{children}</div>
            <p className="mt-6 text-center text-xs text-[color:var(--text-muted)]">
              <Link href="/" className="hover:text-[color:var(--accent)]">
                ← Back to home
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
