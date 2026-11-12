import Link from 'next/link';
import { CalendarIcon, CheckIcon, FileIcon } from '@/components/icons';

const BULLETS = [
  { icon: CalendarIcon, text: "Never miss a deadline, across every application you're juggling." },
  { icon: CheckIcon, text: "See exactly what's left to submit, requirement by requirement." },
  { icon: FileIcon, text: 'Keep transcripts, letters, and essays organized by version.' },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <div className="flex flex-col justify-between gap-10 bg-primary-soft px-8 py-10 lg:w-[440px] lg:flex-none lg:px-12 lg:py-14">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-display text-lg font-bold text-white">
            S
          </span>
          <span className="font-display text-xl font-semibold text-ink">Schola</span>
        </Link>

        <div className="flex max-w-md flex-col gap-7">
          <h1 className="font-display text-3xl font-semibold leading-snug text-ink lg:text-4xl">
            Every scholarship deadline, one calm place to track it.
          </h1>
          <ul className="flex flex-col gap-4">
            {BULLETS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-surface text-primary">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="pt-0.5 text-sm text-ink-soft">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-ink-faint">Built for students applying to universities and scholarships abroad.</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
