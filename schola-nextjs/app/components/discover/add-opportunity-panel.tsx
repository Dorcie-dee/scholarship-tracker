'use client';

import { useId, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch, friendlyErrorMessage } from '@/lib/api-client';
import { opportunityTypeLabel, studyLevelLabel } from '@/lib/status';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Textarea } from '@/components/ui/form';
import { GlobeIcon, SparklesIcon } from '@/components/icons';
import { OPPORTUNITY_TYPE_VALUES, STUDY_LEVEL_VALUES, type Opportunity } from './types';

interface UrlPreview {
  title: string | null;
  extractedContent: string | null;
  /** Best-effort, deterministic cues from the fetched page — never pulled from an LLM. Each one only pre-fills a still-empty field below; any of them can be wrong, and editing is always expected. */
  suggestedOpportunityType: string | null;
  suggestedStudyLevel: string | null;
  suggestedCountry: string | null;
}

interface FormState {
  title: string;
  provider: string;
  opportunityType: string;
  country: string;
  studyLevel: string;
  field: string;
  eligibilitySummary: string;
  applicationUrl: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  provider: '',
  opportunityType: '',
  country: '',
  studyLevel: '',
  field: '',
  eligibilitySummary: '',
  applicationUrl: '',
};

const SELECT_CLASSES =
  'h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

/**
 * The primary "bring your own opportunity" intake surface — the two
 * supported ways in are a URL (fetched SSRF-safely server-side, previewed,
 * then reviewed/edited before anything is saved — never auto-saved) or
 * plain manual entry. Both end at the same editable form; a URL just
 * pre-fills it. On save: `POST /opportunities` (always), then, only when a
 * URL was used, `POST /opportunity-sources` with `autoFetch: true` to
 * record provenance — re-validates the URL server-side rather than trusting
 * the client-cached preview, and is what sets `contentOrigin: 'fetched'`.
 *
 * Rendered inside a `Drawer` (see its consumers) — this component is just
 * the form body, not its own dialog chrome.
 */
export function AddOpportunityPanel({
  onCreated,
  onCancel,
}: {
  onCreated: (opportunity: Opportunity) => void;
  onCancel: () => void;
}) {
  const fieldId = useId();
  const [mode, setMode] = useState<'url' | 'manual'>('url');
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<UrlPreview | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const previewMutation = useMutation({
    mutationFn: (sourceUrl: string) => apiFetch<UrlPreview>('/opportunity-sources/fetch-preview', { method: 'POST', body: { url: sourceUrl } }),
    onSuccess: (data) => {
      setPreview(data);
      setForm((prev) => ({
        ...prev,
        title: prev.title || data.title || '',
        eligibilitySummary: prev.eligibilitySummary || data.extractedContent || '',
        opportunityType: prev.opportunityType || data.suggestedOpportunityType || '',
        studyLevel: prev.studyLevel || data.suggestedStudyLevel || '',
        country: prev.country || data.suggestedCountry || '',
        applicationUrl: url,
      }));
    },
    onError: (err) => setError(friendlyErrorMessage(err)),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = { title: form.title.trim() };
      if (form.provider.trim()) body.provider = form.provider.trim();
      if (form.opportunityType) body.opportunityType = form.opportunityType;
      if (form.country.trim()) body.country = form.country.trim();
      if (form.studyLevel) body.studyLevel = form.studyLevel;
      if (form.field.trim()) body.field = form.field.trim();
      if (form.eligibilitySummary.trim()) body.eligibilitySummary = form.eligibilitySummary.trim();
      if (form.applicationUrl.trim()) body.applicationUrl = form.applicationUrl.trim();

      const opportunity = await apiFetch<Opportunity>('/opportunities', { method: 'POST', body });

      if (mode === 'url' && url.trim()) {
        try {
          await apiFetch('/opportunity-sources', {
            method: 'POST',
            body: { opportunityId: opportunity.id, sourceUrl: url.trim(), autoFetch: true },
          });
        } catch {
          // Best-effort provenance record — the Opportunity itself already
          // saved successfully, so a source-recording failure must not
          // block the user from proceeding.
        }
      }

      return opportunity;
    },
    onSuccess: onCreated,
    onError: (err) => setError(friendlyErrorMessage(err)),
  });

  function handlePreview(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (url.trim()) previewMutation.mutate(url.trim());
  }

  function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) {
      setError('Give this opportunity a title.');
      return;
    }
    createMutation.mutate();
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const showReviewForm = mode === 'manual' || preview !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5 rounded-lg border border-line bg-line-soft/40 p-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'url'}
          onClick={() => setMode('url')}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${mode === 'url' ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'}`}
        >
          From a URL
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'manual'}
          onClick={() => setMode('manual')}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${mode === 'manual' ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'}`}
        >
          Enter manually
        </button>
      </div>

      {mode === 'url' && !preview && (
        <form onSubmit={handlePreview} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor={`${fieldId}-url`}>Opportunity page URL</Label>
            <Input
              id={`${fieldId}-url`}
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <Button type="submit" disabled={previewMutation.isPending || !url.trim()}>
            <GlobeIcon size={16} aria-hidden="true" />
            {previewMutation.isPending ? 'Fetching…' : 'Fetch & review'}
          </Button>
        </form>
      )}

      {showReviewForm && (
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          {mode === 'url' && preview && (
            <div className="flex items-start gap-2 rounded-lg border border-line bg-primary-soft/40 px-3.5 py-2.5 text-xs text-ink-soft">
              <SparklesIcon size={14} className="mt-0.5 flex-none text-primary" aria-hidden="true" />
              <span>
                We pulled information from the page and took a best guess at a few fields — review and edit
                anything below before saving. Nothing is saved until you submit.
              </span>
            </div>
          )}

          <div>
            <Label htmlFor={`${fieldId}-title`}>Title</Label>
            <Input
              id={`${fieldId}-title`}
              required
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="e.g. Chevening Scholarship"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${fieldId}-provider`}>Provider</Label>
              <Input
                id={`${fieldId}-provider`}
                value={form.provider}
                onChange={(e) => update('provider', e.target.value)}
                placeholder="e.g. UK Government"
              />
            </div>
            <div>
              <Label htmlFor={`${fieldId}-type`}>Type</Label>
              <select
                id={`${fieldId}-type`}
                className={SELECT_CLASSES}
                value={form.opportunityType}
                onChange={(e) => update('opportunityType', e.target.value)}
              >
                <option value="">Choose a type</option>
                {OPPORTUNITY_TYPE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {opportunityTypeLabel(value)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor={`${fieldId}-country`}>Country</Label>
              <Input id={`${fieldId}-country`} value={form.country} onChange={(e) => update('country', e.target.value)} />
            </div>
            <div>
              <Label htmlFor={`${fieldId}-study-level`}>Study level</Label>
              <select
                id={`${fieldId}-study-level`}
                className={SELECT_CLASSES}
                value={form.studyLevel}
                onChange={(e) => update('studyLevel', e.target.value)}
              >
                <option value="">Any study level</option>
                {STUDY_LEVEL_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {studyLevelLabel(value)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor={`${fieldId}-summary`}>Eligibility / summary</Label>
            <Textarea
              id={`${fieldId}-summary`}
              value={form.eligibilitySummary}
              onChange={(e) => update('eligibilitySummary', e.target.value)}
              placeholder="Who it's for, what it covers, anything worth remembering"
            />
          </div>

          <div>
            <Label htmlFor={`${fieldId}-application-url`}>Official page (optional)</Label>
            <Input
              id={`${fieldId}-application-url`}
              type="url"
              value={form.applicationUrl}
              onChange={(e) => update('applicationUrl', e.target.value)}
              placeholder="https://..."
            />
          </div>

          <FieldError>{error}</FieldError>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={createMutation.isPending || !form.title.trim()}>
              {createMutation.isPending ? 'Saving…' : 'Save opportunity'}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel} disabled={createMutation.isPending}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
