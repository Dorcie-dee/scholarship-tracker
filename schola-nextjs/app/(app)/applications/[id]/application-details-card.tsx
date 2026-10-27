'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, friendlyErrorMessage } from '@/lib/api-client';
import { formatDate } from '@/lib/status';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldError, Input, Label, Textarea } from '@/components/ui/form';
import { GlobeIcon, PencilIcon } from '@/components/icons';
import { APPLICATION_TYPE_VALUES, applicationTypeLabel, type Application } from './types';

const SELECT_CLASS =
  'h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

interface FormValues {
  applicationType: string;
  startDate: string;
  submissionDate: string;
  portal: string;
  externalUrl: string;
  notes: string;
}

function toValues(application: Application): FormValues {
  return {
    applicationType: application.applicationType,
    startDate: application.startDate ? application.startDate.slice(0, 10) : '',
    submissionDate: application.submissionDate ? application.submissionDate.slice(0, 10) : '',
    portal: application.portal ?? '',
    externalUrl: application.externalUrl ?? '',
    notes: application.notes ?? '',
  };
}

export function ApplicationDetailsCard({ application }: { application: Application }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<FormValues>(() => toValues(application));

  const update = useMutation({
    mutationFn: () =>
      apiFetch(`/applications/${application.id}`, {
        method: 'PATCH',
        body: {
          applicationType: values.applicationType,
          startDate: values.startDate || undefined,
          submissionDate: values.submissionDate || undefined,
          portal: values.portal.trim() || undefined,
          externalUrl: values.externalUrl.trim() || undefined,
          notes: values.notes.trim() || undefined,
        },
      }),
    onSuccess: async () => {
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ['application', application.id] });
    },
  });

  if (editing) {
    return (
      <Card className="p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate();
          }}
          className="flex flex-col gap-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="app-type">Application type</Label>
              <select
                id="app-type"
                className={SELECT_CLASS}
                value={values.applicationType}
                onChange={(e) => setValues((v) => ({ ...v, applicationType: e.target.value }))}
              >
                {APPLICATION_TYPE_VALUES.map((t) => (
                  <option key={t} value={t}>
                    {applicationTypeLabel(t)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="app-portal">Application portal</Label>
              <Input
                id="app-portal"
                maxLength={255}
                value={values.portal}
                onChange={(e) => setValues((v) => ({ ...v, portal: e.target.value }))}
                placeholder="e.g. Slate, CommonApp"
              />
            </div>
            <div>
              <Label htmlFor="app-start">Start date</Label>
              <Input id="app-start" type="date" value={values.startDate} onChange={(e) => setValues((v) => ({ ...v, startDate: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="app-submission">Submission date</Label>
              <Input
                id="app-submission"
                type="date"
                value={values.submissionDate}
                onChange={(e) => setValues((v) => ({ ...v, submissionDate: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="app-url">External URL</Label>
            <Input
              id="app-url"
              type="url"
              value={values.externalUrl}
              onChange={(e) => setValues((v) => ({ ...v, externalUrl: e.target.value }))}
              placeholder="https://…"
            />
          </div>
          <div>
            <Label htmlFor="app-notes">Notes</Label>
            <Textarea id="app-notes" value={values.notes} onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))} />
          </div>
          <FieldError>{update.isError ? friendlyErrorMessage(update.error) : null}</FieldError>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save details'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setValues(toValues(application));
                setEditing(false);
              }}
              disabled={update.isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  const hasAnyDetail = application.portal || application.externalUrl || application.startDate || application.submissionDate || application.notes;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <dl className="grid flex-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-faint">Type</dt>
            <dd className="font-medium text-ink">{applicationTypeLabel(application.applicationType)}</dd>
          </div>
          {application.portal && (
            <div>
              <dt className="text-ink-faint">Portal</dt>
              <dd className="font-medium text-ink">{application.portal}</dd>
            </div>
          )}
          {application.startDate && (
            <div>
              <dt className="text-ink-faint">Start date</dt>
              <dd className="font-medium text-ink">{formatDate(application.startDate)}</dd>
            </div>
          )}
          {application.submissionDate && (
            <div>
              <dt className="text-ink-faint">Submission date</dt>
              <dd className="font-medium text-ink">{formatDate(application.submissionDate)}</dd>
            </div>
          )}
          {application.externalUrl && (
            <div className="sm:col-span-2">
              <dt className="text-ink-faint">Link</dt>
              <dd>
                <a
                  href={application.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:text-primary-hover"
                >
                  <GlobeIcon size={14} aria-hidden="true" />
                  {application.externalUrl}
                </a>
              </dd>
            </div>
          )}
          {application.notes && (
            <div className="sm:col-span-2">
              <dt className="text-ink-faint">Notes</dt>
              <dd className="whitespace-pre-wrap text-ink">{application.notes}</dd>
            </div>
          )}
          {!hasAnyDetail && <p className="text-ink-soft sm:col-span-2">No extra details yet — add a portal, dates or notes.</p>}
        </dl>
        <button
          type="button"
          onClick={() => {
            setValues(toValues(application));
            setEditing(true);
          }}
          aria-label="Edit application details"
          className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-line-soft hover:text-ink"
        >
          <PencilIcon size={16} aria-hidden="true" />
        </button>
      </div>
    </Card>
  );
}
