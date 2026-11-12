import Link from 'next/link';
import { Pill } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { CalendarIcon } from '@/components/icons';
import { applicationStatusMeta, formatDate, relativeDays } from '@/lib/status';
import type { Application, Deadline, Opportunity, RequirementProgress } from '@/_lib/application-data';

interface ApplicationCardProps {
  application: Application;
  opportunity?: Opportunity | null;
  progress: RequirementProgress;
  nextDeadline?: Deadline | null;
}

/**
 * The one card used everywhere an application is shown (Dashboard preview
 * grid, "My applications" grouped grid) so the two pages never drift into
 * slightly different card content.
 */
export function ApplicationCard({ application, opportunity, progress, nextDeadline }: ApplicationCardProps) {
  const meta = applicationStatusMeta(application.status);

  let dateLine: string;
  if (nextDeadline) {
    dateLine = `${nextDeadline.label} — ${relativeDays(nextDeadline.date)}`;
  } else if (application.submissionDate) {
    dateLine = `Submitted ${formatDate(application.submissionDate)}`;
  } else {
    dateLine = 'No deadline set yet';
  }

  return (
    <Link
      href={`/applications/${application.id}`}
      className="flex flex-col rounded-xl border border-line bg-surface p-4 transition-colors hover:border-ink-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-base font-semibold text-ink">{application.title}</p>
          {opportunity ? (
            <p className="mt-0.5 truncate text-xs text-ink-faint">
              {opportunity.title}
              {opportunity.provider ? ` · ${opportunity.provider}` : ''}
            </p>
          ) : (
            <p className="mt-0.5 truncate text-xs text-ink-faint">Independent application</p>
          )}
        </div>
        <Pill tone={meta.tone} className="flex-none">
          {meta.label}
        </Pill>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs text-ink-faint">
          <span>{progress.total > 0 ? `${progress.met} of ${progress.total} requirements` : 'No requirements yet'}</span>
          <span>{progress.total > 0 ? `${progress.percent}%` : '—'}</span>
        </div>
        <ProgressBar value={progress.percent} />
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-ink-faint">
        <CalendarIcon size={14} className="flex-none" aria-hidden="true" />
        <span className="truncate">{dateLine}</span>
      </div>
    </Link>
  );
}
