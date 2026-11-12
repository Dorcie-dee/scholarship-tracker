'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { GlobeIcon, PlusIcon } from '@/components/icons';
import { opportunityTypeLabel, studyLevelLabel } from '@/lib/status';
import { opportunityTypeTone, type Journey, type Opportunity } from './types';
import { StartApplicationPanel } from './start-application-panel';

interface OpportunityCardProps {
  opportunity: Opportunity;
  universityName: string | undefined;
  isExpanded: boolean;
  onToggleExpand: () => void;
  journeys: Journey[] | undefined;
  journeysLoading: boolean;
  journeysErrored: boolean;
  submitting: boolean;
  submitError: string | null;
  onStart: (journeyId: string) => void;
  onCreateAndStart: (title: string) => void;
  onRetryJourneys: () => void;
}

function fundingLine(opportunity: Opportunity): string | null {
  const parts: string[] = [];
  if (opportunity.fundingAmount) {
    parts.push([opportunity.currency, opportunity.fundingAmount].filter(Boolean).join(' '));
  } else if (opportunity.fundingType) {
    parts.push(opportunity.fundingType);
  }
  if (opportunity.duration) parts.push(opportunity.duration);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function OpportunityCard({
  opportunity,
  universityName,
  isExpanded,
  onToggleExpand,
  journeys,
  journeysLoading,
  journeysErrored,
  submitting,
  submitError,
  onStart,
  onCreateAndStart,
  onRetryJourneys,
}: OpportunityCardProps) {
  const placeLine = [universityName ?? opportunity.provider, opportunity.country].filter(Boolean).join(' · ');
  const funding = fundingLine(opportunity);

  return (
    <Card className="flex flex-col p-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={opportunityTypeTone(opportunity.opportunityType)}>
          {opportunityTypeLabel(opportunity.opportunityType)}
        </Pill>
        {opportunity.studyLevel && <Pill tone="neutral">{studyLevelLabel(opportunity.studyLevel)}</Pill>}
        {opportunity.field && <Pill tone="neutral">{opportunity.field}</Pill>}
      </div>

      <h2 className="mt-3 font-display text-card-title font-semibold leading-snug text-ink">{opportunity.title}</h2>

      {placeLine && (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-soft">
          <GlobeIcon size={15} className="flex-none text-ink-faint" aria-hidden="true" />
          <span className="truncate">{placeLine}</span>
        </p>
      )}

      {opportunity.eligibilitySummary && (
        <p className="mt-3 line-clamp-3 text-sm text-ink-soft">{opportunity.eligibilitySummary}</p>
      )}

      {funding && <p className="mt-3 text-xs font-semibold text-ink-faint">{funding}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button type="button" size="sm" onClick={onToggleExpand} aria-expanded={isExpanded}>
          <PlusIcon size={14} aria-hidden="true" />
          Start application
        </Button>
        {opportunity.applicationUrl && (
          <a
            href={opportunity.applicationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-primary hover:text-primary-hover"
          >
            View official page ↗
          </a>
        )}
      </div>

      {isExpanded && (
        <StartApplicationPanel
          opportunityTitle={opportunity.title}
          journeys={journeys}
          journeysLoading={journeysLoading}
          journeysErrored={journeysErrored}
          submitting={submitting}
          submitError={submitError}
          onStart={onStart}
          onCreateAndStart={onCreateAndStart}
          onCancel={onToggleExpand}
          onRetryJourneys={onRetryJourneys}
        />
      )}
    </Card>
  );
}
