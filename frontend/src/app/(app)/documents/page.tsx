'use client';

import {
  DownloadOutlined,
  EditOutlined,
  FileTextOutlined,
  HistoryOutlined,
  InboxOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { App, Button, Drawer, Form, Input, Modal, Select, Timeline, Typography, Upload } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';
import { useState } from 'react';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { CursorPager } from '@/components/CursorPager';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ListSkeleton } from '@/components/LoadingSkeleton';
import { PageHeader } from '@/components/PageHeader';
import { DOCUMENT_TYPE_OPTIONS, humanizeEnum } from '@/lib/labels';
import { DocumentType } from '@/lib/shared-types';
import {
  flattenPages,
  useDeleteDocument,
  useDocumentDownloadUrl,
  useDocumentVersions,
  useDocuments,
  useUpdateDocument,
  useUploadDocument,
  useUploadDocumentVersion,
} from '@/lib/queries';
import { friendlyApiMessage } from '@/lib/user-errors';
import type { AppDocument } from '@/lib/types';

/**
 * The document library — every version of every document the user owns.
 * Version lineage is always shown as one group ("CV — Version 3"), never as
 * unrelated files; the full history is one click away via the version Drawer.
 * Every download goes through the signed `/documents/:id/download-url`
 * endpoint on demand — the raw Cloudinary URL is never rendered or linked.
 */
export default function DocumentsPage() {
  const { message } = App.useApp();
  const { data, isLoading, isError, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } = useDocuments();
  const documents = flattenPages(data?.pages);
  const remove = useDeleteDocument();
  const upload = useUploadDocument();
  const update = useUpdateDocument();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<AppDocument | null>(null);
  const [versionsFor, setVersionsFor] = useState<string | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  const onUpload = async (values: { title: string; documentType: string; notes?: string }) => {
    const file = fileList[0]?.originFileObj as File | undefined;
    if (!file) {
      message.error('Choose a file to upload');
      return;
    }
    try {
      await upload.mutateAsync({ ...values, file });
      setUploadOpen(false);
      form.resetFields();
      setFileList([]);
      message.success('Document uploaded');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not upload this document'));
    }
  };

  const openEdit = (doc: AppDocument) => {
    editForm.setFieldsValue({ title: doc.title, notes: doc.notes ?? undefined });
    setEditing(doc);
  };

  const onEdit = async (values: { title: string; notes?: string }) => {
    if (!editing) return;
    try {
      await update.mutateAsync({
        id: editing.id,
        title: values.title,
        notes: values.notes || undefined,
      });
      setEditing(null);
      message.success('Document updated');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not update this document'));
    }
  };

  if (isLoading) return <ListSkeleton rows={4} />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div className="app-page space-y-5">
      <PageHeader
        eyebrow="Library"
        title="Documents"
        description="Your CV, statements, transcripts, and other files — attach specific versions to applications from each application's workspace."
        extra={
          <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>
            Upload
          </Button>
        }
      />

      {documents.length === 0 ? (
        <EmptyState
          title="No documents uploaded yet"
          description="Upload your CV, statement of purpose, transcripts, or any other file you'll reuse across applications."
          action={{ label: 'Upload a document', onClick: () => setUploadOpen(true) }}
        />
      ) : (
        <>
          <div className="space-y-3 animate-rise">
            {documents.map((doc) => (
              <article key={doc.id} className="surface p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                    <FileTextOutlined />
                  </span>
                  <div className="min-w-0">
                    <h3
                      className="m-0 text-[15px] font-semibold text-[color:var(--ink)] leading-snug"
                      style={{ fontFamily: 'var(--font-display), sans-serif' }}
                    >
                      {doc.title} — Version {doc.version}
                    </h3>
                    <p className="mt-1 mb-0 text-sm text-[color:var(--text-muted)] capitalize">
                      {humanizeEnum(doc.documentType)}
                      {doc.notes ? ` · ${doc.notes}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <DownloadButton documentId={doc.id} />
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(doc)} aria-label={`Edit ${doc.title}`}>
                    Edit
                  </Button>
                  <Button size="small" icon={<HistoryOutlined />} onClick={() => setVersionsFor(doc.id)}>
                    Versions
                  </Button>
                  <ConfirmDeleteButton
                    size="small"
                    title="Delete this document?"
                    description="This only works if it isn't currently attached to an application or referenced by a snapshot."
                    onConfirm={() => remove.mutate(doc.id)}
                    loading={remove.isPending}
                  />
                </div>
              </article>
            ))}
          </div>
          <CursorPager hasNextPage={hasNextPage} isFetchingNextPage={isFetchingNextPage} onLoadMore={() => fetchNextPage()} />
        </>
      )}

      <Modal
        title="Upload document"
        open={uploadOpen}
        onCancel={() => { setUploadOpen(false); setFileList([]); }}
        onOk={() => form.submit()}
        confirmLoading={upload.isPending}
        okText="Upload"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={onUpload} className="!mt-2" requiredMark={false}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input placeholder="e.g. CV" autoFocus size="large" />
          </Form.Item>
          <Form.Item name="documentType" label="Type" initialValue={DocumentType.OTHER} rules={[{ required: true }]}>
            <Select options={DOCUMENT_TYPE_OPTIONS} size="large" />
          </Form.Item>
          <Form.Item label="File" required>
            <Upload.Dragger
              fileList={fileList}
              beforeUpload={() => false}
              onChange={({ fileList }) => setFileList(fileList.slice(-1))}
              maxCount={1}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p>Click or drag a file here</p>
            </Upload.Dragger>
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit document"
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onOk={() => editForm.submit()}
        confirmLoading={update.isPending}
        okText="Save"
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={onEdit} className="!mt-2" requiredMark={false}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <VersionsDrawer documentId={versionsFor} onClose={() => setVersionsFor(null)} />
    </div>
  );
}

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

function VersionsDrawer({ documentId, onClose }: { documentId: string | null; onClose: () => void }) {
  const { message } = App.useApp();
  const { data: versions, isLoading } = useDocumentVersions(documentId ?? '');
  const uploadVersion = useUploadDocumentVersion(documentId ?? '');
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const onUploadNewVersion = async () => {
    const file = fileList[0]?.originFileObj as File | undefined;
    if (!file || !documentId) return;
    try {
      await uploadVersion.mutateAsync({ file });
      setFileList([]);
      message.success('New version uploaded');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not upload a new version — it may have already been superseded'));
    }
  };

  return (
    <Drawer title="Version history" open={Boolean(documentId)} onClose={onClose} width={420}>
      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : (
        <div className="space-y-5">
          <Timeline
            items={(versions ?? [])
              .slice()
              .reverse()
              .map((v) => ({
                children: (
                  <div>
                    <div className="font-medium text-[color:var(--ink)]">
                      Version {v.version} {v.isCurrent && <Typography.Text type="success"> (current)</Typography.Text>}
                    </div>
                    <div className="text-sm text-[color:var(--text-muted)]">
                      {dayjs(v.createdAt).format('MMM D, YYYY, h:mm A')}
                    </div>
                  </div>
                ),
              }))}
          />
          <div className="surface p-4">
            <p className="m-0 text-sm font-semibold text-[color:var(--ink)]">Upload a new version</p>
            <Upload.Dragger
              className="mt-3"
              fileList={fileList}
              beforeUpload={() => false}
              onChange={({ fileList }) => setFileList(fileList.slice(-1))}
              maxCount={1}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p>Click or drag a file here</p>
            </Upload.Dragger>
            <Button
              className="mt-3"
              type="primary"
              block
              disabled={fileList.length === 0}
              loading={uploadVersion.isPending}
              onClick={() => void onUploadNewVersion()}
            >
              Upload as new version
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
