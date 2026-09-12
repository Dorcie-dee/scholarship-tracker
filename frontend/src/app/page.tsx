'use client';

import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  CompassOutlined,
  FileProtectOutlined,
  ScheduleOutlined,
} from '@ant-design/icons';
import { Button, Spin } from 'antd';
import Link from 'next/link';
import { BrandMark } from '@/components/BrandMark';
import { useAuth } from '@/lib/auth-context';

const FEATURES = [
  {
    icon: <CompassOutlined className="text-xl" />,
    title: 'Journeys, not spreadsheets',
    body: 'Group every admission and scholarship under one clear goal — so progress stays coherent.',
  },
  {
    icon: <ScheduleOutlined className="text-xl" />,
    title: 'Deadlines you can trust',
    body: 'Track requirements, tasks, and dates inside each application workspace — nothing invented.',
  },
  {
    icon: <FileProtectOutlined className="text-xl" />,
    title: 'Versioned documents',
    body: 'Upload CVs and statements once, attach exact versions to applications, and keep history intact.',
  },
] as const;

const STEPS = [
  { step: '01', title: 'Create a journey', body: 'Name the programme or path you are pursuing.' },
  { step: '02', title: 'Add applications', body: 'Admission, university funding, external scholarships.' },
  { step: '03', title: 'Work the checklist', body: 'Requirements, tasks, deadlines, and documents in one place.' },
] as const;

/**
 * Public marketing site. Authenticated visitors still see it (with a dashboard CTA);
 * they are not force-redirected — the product homepage is part of the brand.
 */
export default function MarketingHomePage() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex flex-1 min-h-screen items-center justify-center hero-atmosphere">
        <Spin size="large" />
      </div>
    );
  }

  const primaryHref = status === 'authenticated' ? '/dashboard' : '/register';
  const primaryLabel = status === 'authenticated' ? 'Open dashboard' : 'Get started free';
  const secondaryHref = status === 'authenticated' ? '/opportunities' : '/login';
  const secondaryLabel = status === 'authenticated' ? 'Browse opportunities' : 'Log in';

  return (
    <div className="min-h-screen flex flex-col bg-[color:var(--canvas)]">
      {/* Nav */}
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <BrandMark href="/" variant="on-dark" size="md" />
          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Primary">
            <a
              href="#how-it-works"
              className="hidden sm:inline text-sm text-white/70 hover:text-white transition-colors px-2"
            >
              How it works
            </a>
            <a
              href="#product"
              className="hidden sm:inline text-sm text-white/70 hover:text-white transition-colors px-2"
            >
              Product
            </a>
            <Link href={secondaryHref}>
              <Button type="text" className="!text-white/85 hover:!text-white hover:!bg-white/10">
                {secondaryLabel}
              </Button>
            </Link>
            <Link href={primaryHref}>
              <Button type="primary" className="!bg-white !text-[color:var(--ink)] hover:!bg-cyan-50 !border-0 !font-semibold">
                {primaryLabel}
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero — brand first, full-bleed atmosphere */}
      <section className="relative hero-atmosphere text-white overflow-hidden min-h-[min(92vh,820px)] flex flex-col">
        <div className="absolute inset-0 grid-fade pointer-events-none" aria-hidden />
        <div className="absolute -right-20 top-28 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl animate-drift pointer-events-none" />
        <div className="absolute left-10 bottom-20 h-56 w-56 rounded-full bg-teal-500/15 blur-3xl animate-drift pointer-events-none" style={{ animationDelay: '1.5s' }} />

        <div className="relative z-10 flex-1 flex flex-col justify-center mx-auto max-w-6xl w-full px-4 sm:px-6 pt-28 pb-20">
          <p className="animate-rise text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/90 mb-5">
            Scholarship OS
          </p>
          <h1
            className="animate-rise-delay-1 m-0 max-w-3xl text-[clamp(2.4rem,6vw,4.25rem)] font-semibold leading-[1.05] tracking-tight"
            style={{ fontFamily: 'var(--font-display), sans-serif' }}
          >
            The operating system for your applications.
          </h1>
          <p className="animate-rise-delay-2 mt-6 mb-0 max-w-xl text-lg sm:text-xl text-white/70 leading-relaxed">
            Plan journeys, run every scholarship and admission process, and keep documents, deadlines,
            and tasks in one calm workspace.
          </p>
          <div className="animate-rise-delay-3 mt-10 flex flex-wrap gap-3">
            <Link href={primaryHref}>
              <Button
                type="primary"
                size="large"
                icon={<ArrowRightOutlined />}
                iconPosition="end"
                className="!h-12 !px-6 !bg-white !text-[color:var(--ink)] hover:!bg-cyan-50 !border-0 !font-semibold"
              >
                {primaryLabel}
              </Button>
            </Link>
            <a href="#product">
              <Button
                size="large"
                className="!h-12 !px-6 !bg-transparent !text-white !border-white/25 hover:!bg-white/10 hover:!border-white/40"
              >
                See the product
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Product */}
      <section id="product" className="relative py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl mb-14">
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--accent)]">
              Built for applicants
            </p>
            <h2
              className="mt-3 mb-0 text-3xl sm:text-4xl font-semibold text-[color:var(--ink)] tracking-tight"
              style={{ fontFamily: 'var(--font-display), sans-serif' }}
            >
              Everything you need after “I should apply.”
            </h2>
            <p className="mt-4 mb-0 text-[color:var(--text-secondary)] text-lg leading-relaxed">
              Scholarship OS is structured around how ambitious applicants actually work — journeys,
              applications, and the checklists that decide outcomes.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.title} className="surface p-6 sm:p-7">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                  {f.icon}
                </div>
                <h3 className="m-0 text-lg font-semibold text-[color:var(--ink)]">{f.title}</h3>
                <p className="mt-2 mb-0 text-sm text-[color:var(--text-secondary)] leading-relaxed">
                  {f.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20 sm:py-24 border-y border-[color:var(--border)] bg-[color:var(--surface)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] items-start">
            <div>
              <p className="m-0 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--accent)]">
                How it works
              </p>
              <h2
                className="mt-3 mb-0 text-3xl font-semibold text-[color:var(--ink)] tracking-tight"
                style={{ fontFamily: 'var(--font-display), sans-serif' }}
              >
                Three steps from chaos to clarity.
              </h2>
              <p className="mt-4 mb-6 text-[color:var(--text-secondary)] leading-relaxed">
                No bloated CRM. Just the structure that keeps applications moving.
              </p>
              <Link href={primaryHref}>
                <Button type="primary" size="large" icon={<ArrowRightOutlined />} iconPosition="end">
                  {primaryLabel}
                </Button>
              </Link>
            </div>
            <ol className="m-0 p-0 list-none space-y-4">
              {STEPS.map((s) => (
                <li key={s.step} className="surface flex gap-5 p-5 sm:p-6">
                  <span
                    className="text-2xl font-semibold text-[color:var(--accent)] tabular-nums"
                    style={{ fontFamily: 'var(--font-display), sans-serif' }}
                  >
                    {s.step}
                  </span>
                  <div>
                    <h3 className="m-0 text-base font-semibold text-[color:var(--ink)]">{s.title}</h3>
                    <p className="mt-1 mb-0 text-sm text-[color:var(--text-secondary)]">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="surface overflow-hidden relative">
            <div className="absolute inset-0 mesh-light opacity-60 pointer-events-none" />
            <div className="relative grid gap-8 md:grid-cols-2 p-8 sm:p-12 items-center">
              <div>
                <h2
                  className="m-0 text-2xl sm:text-3xl font-semibold text-[color:var(--ink)] tracking-tight"
                  style={{ fontFamily: 'var(--font-display), sans-serif' }}
                >
                  Production-ready for real application seasons.
                </h2>
                <p className="mt-3 mb-0 text-[color:var(--text-secondary)] leading-relaxed">
                  Secure auth, soft-delete safety, signed document downloads, and a workspace designed
                  for long application cycles — not demo day screenshots.
                </p>
              </div>
              <ul className="m-0 p-0 list-none space-y-3">
                {[
                  'Email verification & session controls',
                  'Owned journeys with nested application workspaces',
                  'Catalog of universities and opportunities',
                  'Responsive dashboard across phone, tablet, desktop',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-[color:var(--ink)]">
                    <CheckCircleOutlined className="text-[color:var(--accent)] mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="relative hero-atmosphere text-white overflow-hidden">
        <div className="absolute inset-0 grid-fade pointer-events-none" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-24 text-center">
          <h2
            className="m-0 text-3xl sm:text-4xl font-semibold tracking-tight"
            style={{ fontFamily: 'var(--font-display), sans-serif' }}
          >
            Ready when you are.
          </h2>
          <p className="mt-4 mb-8 mx-auto max-w-lg text-white/65 text-lg">
            Create an account and start your first journey in under a minute.
          </p>
          <Link href={primaryHref}>
            <Button
              type="primary"
              size="large"
              className="!h-12 !px-8 !bg-white !text-[color:var(--ink)] hover:!bg-cyan-50 !border-0 !font-semibold"
            >
              {primaryLabel}
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-[color:var(--border)] bg-[color:var(--surface)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <BrandMark href="/" size="sm" />
          <p className="m-0 text-sm text-[color:var(--text-muted)]">
            © {new Date().getFullYear()} Scholarship OS. Built for applicants.
          </p>
          <div className="flex gap-4 text-sm">
            <Link href="/login" className="text-[color:var(--text-secondary)] hover:text-[color:var(--accent)]">
              Log in
            </Link>
            <Link href="/register" className="text-[color:var(--text-secondary)] hover:text-[color:var(--accent)]">
              Register
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
