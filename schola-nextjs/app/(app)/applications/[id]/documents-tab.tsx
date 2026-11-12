'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, friendlyErrorMessage } from '@/lib/api-client';
import { formatDate } from '@/lib/status';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { FieldError, Input, Label, Textarea } from '@/components/ui/form';
import { DownloadIcon, FileIcon, PlusIcon, TrashIcon, UploadIcon } from '@/components/icons';
import {
  DOCUMENT_TYPE_VALUES,
  documentTypeLabel,
  formatFileSize,
  type ApplicationDocumentLink,
  type DocumentRecord,
  type PaginatedResult,
} from './types';
import { RowActions, Spinner, TabEmpty, TabError, iconButtonClass } from './tab-support';

const SELECT_CLASS =
  'h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

function UploadForm({ applicationId, onDone }: { applicationId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [documentType, setDocumentType] = useState('other');
  const [notes, setNotes] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async () => {
      const file = fileInputRef.current?.files?.[0];
      if (!file) throw new Error('Choose a file to upload.');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title.trim());
      formData.append('documentType', documentType);
      if (notes.trim()) formData.append('notes', notes.trim());

      // Two-call flow (upload, then attach), presented as one action — see
      // `server/services/documents.service.ts` + `applications.service.ts#attachDocument`.
      const document = await apiFetch<DocumentRecord>('/documents', { method: 'POST', body: formData });
      await apiFetch(`/applications/${applicationId}/documents`, { method: 'POST', body: { documentId: document.id } });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['application-documents', applicationId] }),
        queryClient.invalidateQueries({ queryKey: ['documents', 'current'] }),
      ]);
      onDone();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        upload.mutate();
      }}
      className="flex flex-col gap-3 rounded-lg border border-line bg-paper p-4"
    >
      <div>
        <Label htmlFor="doc-title">Title</Label>
        <Input
          id="doc-title"
          required
          maxLength={255}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Statement of purpose — final draft"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="doc-type">Type</Label>
          <select id="doc-type" className={`${SELECT_CLASS} w-full`} value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
            {DOCUMENT_TYPE_VALUES.map((t) => (
              <option key={t} value={t}>
                {documentTypeLabel(t)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="doc-file">File</Label>
          <input
            id="doc-file"
            ref={fileInputRef}
            type="file"
            required
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            className="block w-full text-sm text-ink-soft file:mr-3 file:h-9 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3.5 file:text-sm file:font-semibold file:text-primary hover:file:bg-primary/20"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="doc-notes">Notes (optional)</Label>
        <Textarea id="doc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <FieldError>{upload.isError ? friendlyErrorMessage(upload.error) : null}</FieldError>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={upload.isPending || !title.trim() || !fileName}>
          {upload.isPending ? 'Uploading…' : 'Upload document'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onDone} disabled={upload.isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function AttachExistingForm({ applicationId, excludeIds, onDone }: { applicationId: string; excludeIds: Set<string>; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState('');

  const library = useQuery({
    queryKey: ['documents', 'current'],
    queryFn: () => apiFetch<PaginatedResult<DocumentRecord>>('/documents?limit=100'),
  });

  const attach = useMutation({
    mutationFn: () => apiFetch(`/applications/${applicationId}/documents`, { method: 'POST', body: { documentId: selected } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['application-documents', applicationId] });
      onDone();
    },
  });

  const options = (library.data?.items ?? []).filter((doc) => !excludeIds.has(doc.id));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (selected) attach.mutate();
      }}
      className="flex flex-col gap-3 rounded-lg border border-line bg-paper p-4"
    >
      {library.isLoading && <Spinner label="Loading your documents…" />}
      {library.isError && <TabError message={friendlyErrorMessage(library.error)} />}
      {!library.isLoading && !library.isError && options.length === 0 && (
        <p className="text-sm text-ink-soft">All of your uploaded documents are already attached here — upload a new one instead.</p>
      )}
      {!library.isLoading && !library.isError && options.length > 0 && (
        <div>
          <Label htmlFor="doc-existing">Choose a document</Label>
          <select id="doc-existing" className={`${SELECT_CLASS} w-full`} value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="" disabled>
              Select one of your documents…
            </option>
            {options.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.title} ({documentTypeLabel(doc.documentType)}, v{doc.version})
              </option>
            ))}
          </select>
        </div>
      )}
      <FieldError>{attach.isError ? friendlyErrorMessage(attach.error) : null}</FieldError>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={attach.isPending || !selected}>
          {attach.isPending ? 'Attaching…' : 'Attach document'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onDone} disabled={attach.isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DocumentRow({ applicationId, link }: { applicationId: string; link: ApplicationDocumentLink }) {
  const queryClient = useQueryClient();
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const detach = useMutation({
    mutationFn: () => apiFetch(`/applications/${applicationId}/documents/${link.documentId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['application-documents', applicationId] }),
  });

  const download = useMutation({
    mutationFn: () => apiFetch<{ url: string; expiresInSeconds: number }>(`/documents/${link.documentId}/download-url`),
    onSuccess: (data) => {
      window.open(data.url, '_blank', 'noopener,noreferrer');
    },
    onError: (err) => setDownloadError(friendlyErrorMessage(err)),
  });

  const doc = link.document;

  return (
    <Card className="flex items-start gap-3 p-4">
      <FileIcon size={20} className="mt-0.5 flex-none text-ink-faint" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{doc?.title ?? 'Document unavailable'}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {doc && <Pill tone="neutral">{documentTypeLabel(doc.documentType)}</Pill>}
          {doc && <span className="text-xs text-ink-faint">v{doc.version}</span>}
          {doc?.fileSizeBytes != null && <span className="text-xs text-ink-faint">{formatFileSize(doc.fileSizeBytes)}</span>}
          <span className="text-xs text-ink-faint">Attached {formatDate(link.attachedAt)}</span>
        </div>
        {link.label && <p className="mt-1 text-xs text-ink-soft">Role: {link.label}</p>}
        {downloadError && <p className="mt-1 text-xs font-medium text-danger">{downloadError}</p>}
      </div>
      <ConfirmAction
        prompt="Detach this document? The file itself is kept in your documents."
        confirmLabel="Detach"
        disabled={detach.isPending}
        onConfirm={() => detach.mutate()}
      >
        {(startConfirm) => (
          <RowActions>
            <button
              type="button"
              className={iconButtonClass()}
              aria-label={`Download "${doc?.title ?? 'document'}"`}
              onClick={() => download.mutate()}
              disabled={download.isPending || !doc}
            >
              <DownloadIcon size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={iconButtonClass('danger')}
              aria-label={`Detach "${doc?.title ?? 'document'}"`}
              onClick={startConfirm}
            >
              <TrashIcon size={16} aria-hidden="true" />
            </button>
          </RowActions>
        )}
      </ConfirmAction>
    </Card>
  );
}

export function DocumentsTab({
  applicationId,
  links,
  isLoading,
  isError,
  error,
}: {
  applicationId: string;
  links: ApplicationDocumentLink[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}) {
  const [panel, setPanel] = useState<'none' | 'upload' | 'existing'>('none');
  const excludeIds = new Set((links ?? []).map((l) => l.documentId));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">Attach the exact document versions you're using for this application.</p>
        {panel === 'none' && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setPanel('existing')}>
              <PlusIcon size={14} aria-hidden="true" />
              Attach existing
            </Button>
            <Button size="sm" onClick={() => setPanel('upload')}>
              <UploadIcon size={14} aria-hidden="true" />
              Upload document
            </Button>
          </div>
        )}
      </div>

      {panel === 'upload' && <UploadForm applicationId={applicationId} onDone={() => setPanel('none')} />}
      {panel === 'existing' && <AttachExistingForm applicationId={applicationId} excludeIds={excludeIds} onDone={() => setPanel('none')} />}

      {isLoading && <Spinner label="Loading documents…" />}
      {isError && <TabError message={friendlyErrorMessage(error)} />}
      {!isLoading && !isError && links && links.length === 0 && (
        <TabEmpty>No documents attached yet. Upload one above, or attach something you've already uploaded elsewhere.</TabEmpty>
      )}
      {!isLoading && !isError && links?.map((link) => <DocumentRow key={link.id} applicationId={applicationId} link={link} />)}
    </div>
  );
}
