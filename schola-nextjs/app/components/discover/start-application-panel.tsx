'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/form';
import { PlusIcon } from '@/components/icons';
import type { Journey } from './types';

interface StartApplicationPanelProps {
  opportunityTitle: string;
  journeys: Journey[] | undefined;
  journeysLoading: boolean;
  journeysErrored: boolean;
  submitting: boolean;
  submitError: string | null;
  onStart: (journeyId: string) => void;
  onCreateAndStart: (title: string) => void;
  onCancel: () => void;
  onRetryJourneys: () => void;
}

/**
 * Inline (never a blocking modal) "start an application" flow, expanded
 * below an opportunity card. Three shapes depending on the user's journeys:
 * exactly one -> a single confirm step; several -> pick one (or branch into
 * "new journey"); none -> name one inline, right here.
 */
export function StartApplicationPanel({
  opportunityTitle,
  journeys,
  journeysLoading,
  journeysErrored,
  submitting,
  submitError,
  onStart,
  onCreateAndStart,
  onCancel,
  onRetryJourneys,
}: StartApplicationPanelProps) {
  const fieldId = useId();
  const list = journeys ?? [];
  const [mode, setMode] = useState<'pick' | 'create'>(list.length === 0 ? 'create' : 'pick');
  const [selectedId, setSelectedId] = useState<string>(list[0]?.id ?? '');
  const [newTitle, setNewTitle] = useState('');

  if (journeysLoading) {
    return (
      <div className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-sm text-ink-soft">
        <span
          className="h-4 w-4 flex-none animate-spin rounded-full border-2 border-line border-t-primary"
          role="status"
          aria-label="Loading your journeys"
        />
        Loading your journeys…
      </div>
    );
  }

  if (journeysErrored) {
    return (
      <div className="mt-4 border-t border-line pt-4">
        <p className="text-sm text-danger">We couldn't load your journeys.</p>
        <div className="mt-2 flex items-center gap-2">
          <Button type="button" size="sm" onClick={onRetryJourneys}>
            Try again
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  // Exactly one journey — a single, fast confirm step.
  if (mode === 'pick' && list.length === 1) {
    const journey = list[0];
    return (
      <div className="mt-4 border-t border-line pt-4">
        <p className="text-sm text-ink-soft">
          We'll add this to your journey <span className="font-semibold text-ink">"{journey.title}"</span>.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Button type="button" size="sm" disabled={submitting} onClick={() => onStart(journey.id)}>
            {submitting ? 'Starting…' : 'Start application'}
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={submitting} onClick={onCancel}>
            Cancel
          </Button>
        </div>
        <FieldError>{submitError}</FieldError>
      </div>
    );
  }

  if (mode === 'pick') {
    return (
      <div className="mt-4 border-t border-line pt-4">
        <fieldset>
          <legend className="text-xs font-semibold text-ink-soft">Choose a journey for "{opportunityTitle}"</legend>
          <div className="mt-2 flex flex-col gap-1.5">
            {list.map((journey) => (
              <label
                key={journey.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-ink has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
              >
                <input
                  type="radio"
                  name={`${fieldId}-journey`}
                  value={journey.id}
                  checked={selectedId === journey.id}
                  onChange={() => setSelectedId(journey.id)}
                  className="h-4 w-4 flex-none accent-primary"
                />
                <span className="truncate">{journey.title}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button
          type="button"
          onClick={() => setMode('create')}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-hover"
        >
          <PlusIcon size={14} aria-hidden="true" />
          New journey instead
        </button>
        <div className="mt-3 flex items-center gap-2">
          <Button type="button" size="sm" disabled={submitting || !selectedId} onClick={() => onStart(selectedId)}>
            {submitting ? 'Starting…' : 'Start application'}
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={submitting} onClick={onCancel}>
            Cancel
          </Button>
        </div>
        <FieldError>{submitError}</FieldError>
      </div>
    );
  }

  // mode === 'create'
  return (
    <form
      className="mt-4 border-t border-line pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (newTitle.trim()) onCreateAndStart(newTitle.trim());
      }}
    >
      <Label htmlFor={`${fieldId}-title`}>
        {list.length === 0 ? 'Name your application journey' : 'Name your new journey'}
      </Label>
      <Input
        id={`${fieldId}-title`}
        value={newTitle}
        maxLength={255}
        placeholder="e.g. Fall 2026 Master's applications"
        onChange={(e) => setNewTitle(e.target.value)}
        required
        autoFocus
      />
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" size="sm" disabled={submitting || !newTitle.trim()}>
          {submitting ? 'Starting…' : 'Create & start application'}
        </Button>
        {list.length > 0 ? (
          <Button type="button" variant="secondary" size="sm" disabled={submitting} onClick={() => setMode('pick')}>
            Back
          </Button>
        ) : (
          <Button type="button" variant="secondary" size="sm" disabled={submitting} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      <FieldError>{submitError}</FieldError>
    </form>
  );
}
