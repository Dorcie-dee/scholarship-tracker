'use client';

import { DownloadOutlined, LinkOutlined } from '@ant-design/icons';
import { App, Button, Form, Modal, Select } from 'antd';
import { useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ListSkeleton } from '@/components/LoadingSkeleton';
import {
  flattenPages,
  useApplicationDocuments,
  useAttachDocument,
  useDetachDocument,
  useDocumentDownloadUrl,
  useDocuments,
} from '@/lib/queries';

/**
 * Documents are never linked to directly by a raw Cloudinary URL anywhere in
 * this app — every download goes through `GET /documents/:id/download-url`
 * on demand, right before opening it (see docs/api-reference.md, "Documents").
 * Version lineage ("CV — Version 3") is shown as the document's own title +
 * version, since ApplicationDocument pins one exact version.
 */
function DownloadButton({ documentId }: { documentId: string }) {
  const { refetch, isFetching } = useDocumentDownloadUrl(documentId);
  const { message } = App.useApp();

  const onClick = async () => {
    const { data, error } = await refetch();
    if (error || !data) {
      message.error('Could not get a download link — please try again');
      return;
    }
    window.open(data.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Button size="small" icon={<DownloadOutlined />} loading={isFetching} onClick={() => void onClick()}>
      Download
    </Button>
  );
}

export function DocumentsTab({ applicationId }: { applicationId: string }) {
  const { message } = App.useApp();
  const { data: attached, isLoading, isError, error, refetch } = useApplicationDocuments(applicationId);
  const { data: allDocsData } = useDocuments();
  const allDocs = flattenPages(allDocsData?.pages);
  const attach = useAttachDocument(applicationId);
  const detach = useDetachDocument(applicationId);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const attachedDocumentIds = new Set((attached ?? []).map((a) => a.documentId));
  const availableToAttach = allDocs.filter((d) => !attachedDocumentIds.has(d.id));

  const onAttach = async (values: { documentId: string; label?: string }) => {
    try {
      await attach.mutateAsync(values);
      setModalOpen(false);
      form.resetFields();
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : 'Could not attach document');
    }
  };

  if (isLoading) return <ListSkeleton />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<LinkOutlined />} onClick={() => setModalOpen(true)}>
          Attach document
        </Button>
      </div>

      {!attached || attached.length === 0 ? (
        <EmptyState
          title="No documents attached yet"
          description="Attach a document from your library (upload new ones from the Documents page) — attaching pins the exact version currently in use for this application."
          action={{ label: 'Attach a document', onClick: () => setModalOpen(true) }}
        />
      ) : (
        <div className="space-y-2">
          {attached.map((a) => (
            <article
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-[calc(var(--radius)-4px)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3.5"
            >
              <div className="min-w-0">
                <p
                  className="m-0 text-sm font-semibold text-[color:var(--ink)]"
                  style={{ fontFamily: 'var(--font-display), sans-serif' }}
                >
                  {a.document?.title ?? 'Document'} — Version {a.document?.version ?? '?'}
                </p>
                {a.label && (
                  <p className="mt-0.5 mb-0 text-sm text-[color:var(--text-muted)]">{a.label}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <DownloadButton documentId={a.documentId} />
                <Button size="small" danger onClick={() => detach.mutate(a.documentId)} loading={detach.isPending}>
                  Detach
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        title="Attach document"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={attach.isPending}
        okText="Attach"
        destroyOnHidden
      >
        {availableToAttach.length === 0 ? (
          <EmptyState
            title="No unattached documents in your library"
            description="Upload a document from the Documents page first, then attach it here."
          />
        ) : (
          <Form form={form} layout="vertical" onFinish={onAttach} className="!mt-2">
            <Form.Item name="documentId" label="Document" rules={[{ required: true }]}>
              <Select
                size="large"
                options={availableToAttach.map((d) => ({ value: d.id, label: `${d.title} — Version ${d.version}` }))}
              />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  );
}
