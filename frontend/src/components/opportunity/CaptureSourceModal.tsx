'use client';

import { App, Button, Checkbox, Form, Input, Modal, Select } from 'antd';
import { useEffect, useState } from 'react';
import {
  AUTHORITY_OPTIONS,
  SOURCE_TYPE_HINTS,
  SOURCE_TYPE_LABELS,
  SOURCE_TYPE_OPTIONS,
} from '@/lib/labels';
import { OpportunitySourceType, SourceAuthorityLevel } from '@/lib/shared-types';
import {
  useCreateOpportunitySource,
  useFetchUrlPreview,
  useUpdateOpportunitySource,
} from '@/lib/queries';
import { friendlyApiMessage } from '@/lib/user-errors';
import type { OpportunitySource } from '@/lib/types';

type SourceFormValues = {
  sourceType: OpportunitySourceType;
  sourceName?: string;
  sourceUrl?: string;
  extractedContent?: string;
  authorityLevel: SourceAuthorityLevel;
  notes?: string;
  publishedAt?: string;
  autoFetch?: boolean;
};

/**
 * Capture where an opportunity was found. Supports optional URL preview /
 * autoFetch — empty name/excerpt fields only; never overwrites user text.
 */
export function CaptureSourceModal({
  opportunityId,
  open,
  onClose,
  editing,
}: {
  opportunityId: string;
  open: boolean;
  onClose: () => void;
  editing?: OpportunitySource | null;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<SourceFormValues>();
  const create = useCreateOpportunitySource();
  const update = useUpdateOpportunitySource(opportunityId);
  const fetchPreview = useFetchUrlPreview();
  const sourceType = Form.useWatch('sourceType', form) as OpportunitySourceType | undefined;
  const sourceUrl = Form.useWatch('sourceUrl', form) as string | undefined;
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState(`${open}:${editing?.id ?? 'new'}`);
  const nextSessionKey = `${open}:${editing?.id ?? 'new'}`;
  if (nextSessionKey !== sessionKey) {
    setSessionKey(nextSessionKey);
    setPreviewNote(null);
  }
  const pending = create.isPending || update.isPending || fetchPreview.isPending;

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.setFieldsValue({
        sourceType: editing.sourceType,
        sourceName: editing.sourceName ?? undefined,
        sourceUrl: editing.sourceUrl ?? undefined,
        extractedContent: editing.extractedContent ?? undefined,
        authorityLevel: editing.authorityLevel,
        notes: editing.notes ?? undefined,
        publishedAt: editing.publishedAt?.slice(0, 10),
        autoFetch: false,
      });
    } else {
      form.setFieldsValue({
        sourceType: OpportunitySourceType.SECONDARY_WEBSITE,
        authorityLevel: SourceAuthorityLevel.UNVERIFIED,
        sourceName: undefined,
        sourceUrl: undefined,
        extractedContent: undefined,
        notes: undefined,
        publishedAt: undefined,
        autoFetch: true,
      });
    }
  }, [open, editing, form]);

  const onPreview = async () => {
    const url = form.getFieldValue('sourceUrl')?.trim();
    if (!url) {
      message.warning('Paste a website link first');
      return;
    }
    try {
      const preview = await fetchPreview.mutateAsync(url);
      const current = form.getFieldsValue();
      form.setFieldsValue({
        sourceName: current.sourceName?.trim() ? current.sourceName : (preview.title ?? undefined),
        extractedContent: current.extractedContent?.trim()
          ? current.extractedContent
          : preview.extractedContent,
      });
      setPreviewNote(
        preview.finalUrl !== preview.url
          ? `Preview ready (followed redirect to ${preview.finalUrl}). Empty fields were filled — your typed text was kept.`
          : 'Preview ready. Empty fields were filled — your typed text was kept.',
      );
      message.success('Page preview loaded');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not fetch that URL'));
    }
  };

  const onFinish = async (values: SourceFormValues) => {
    const payload = {
      sourceType: values.sourceType,
      authorityLevel: values.authorityLevel,
      sourceUrl: values.sourceUrl?.trim() || undefined,
      sourceName: values.sourceName?.trim() || undefined,
      extractedContent: values.extractedContent?.trim() || undefined,
      notes: values.notes?.trim() || undefined,
      publishedAt: values.publishedAt ? new Date(values.publishedAt).toISOString() : undefined,
    };

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...payload });
        message.success('Source updated');
      } else {
        await create.mutateAsync({
          opportunityId,
          ...payload,
          autoFetch: Boolean(values.autoFetch && payload.sourceUrl),
        });
        message.success('Source saved');
      }
      onClose();
    } catch (error) {
      message.error(
        friendlyApiMessage(error, editing ? 'Could not update this source' : 'Could not save this source'),
      );
    }
  };

  const hint =
    sourceType && SOURCE_TYPE_HINTS[sourceType]
      ? SOURCE_TYPE_HINTS[sourceType]
      : 'Add a link and/or an excerpt so you remember where this came from.';

  const needsUrl =
    sourceType === OpportunitySourceType.OFFICIAL_UNIVERSITY_WEBSITE ||
    sourceType === OpportunitySourceType.SCHOLARSHIP_PROVIDER ||
    sourceType === OpportunitySourceType.SECONDARY_WEBSITE;

  const excerptLabel =
    sourceType === OpportunitySourceType.FORWARDED_EMAIL
      ? 'Email excerpt'
      : sourceType === OpportunitySourceType.NEWSLETTER
        ? 'Newsletter excerpt'
        : 'Excerpt';

  return (
    <Modal
      title={editing ? 'Edit source' : 'Capture a source'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={pending}
      okText={editing ? 'Save changes' : 'Save source'}
      width={560}
      destroyOnHidden
    >
      <p className="mt-0 mb-4 text-sm text-[color:var(--text-secondary)] leading-relaxed">
        Record how you found this opportunity. Paste a link to preview the page, or turn on auto-fetch
        when saving — we only fill empty fields and never create a new opportunity from the URL.
      </p>
      <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
        <Form.Item
          name="sourceType"
          label="How did you find it?"
          rules={[{ required: true, message: 'Choose a source type' }]}
        >
          <Select
            size="large"
            options={SOURCE_TYPE_OPTIONS.map((o) => ({
              ...o,
              label: SOURCE_TYPE_LABELS[o.value as OpportunitySourceType] ?? o.label,
            }))}
          />
        </Form.Item>
        <p className="!mt-[-8px] mb-4 text-xs text-[color:var(--text-muted)] leading-relaxed">{hint}</p>

        <Form.Item name="sourceName" label="Label (optional)">
          <Input
            size="large"
            placeholder={
              sourceType === OpportunitySourceType.FORWARDED_EMAIL
                ? 'e.g. Email from advisor — Chevening'
                : 'e.g. Twente scholarship page'
            }
          />
        </Form.Item>

        <Form.Item
          name="sourceUrl"
          label={needsUrl ? 'Website link' : 'Link (optional)'}
          rules={
            needsUrl
              ? [
                  { required: true, message: 'Paste the page link' },
                  { type: 'url', message: 'Enter a valid URL (including https://)' },
                ]
              : [{ type: 'url', message: 'Enter a valid URL (including https://)' }]
          }
        >
          <Input size="large" placeholder="https://" />
        </Form.Item>

        {!editing && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void onPreview()}
              loading={fetchPreview.isPending}
              disabled={!sourceUrl?.trim()}
            >
              Preview page
            </Button>
            <Form.Item name="autoFetch" valuePropName="checked" className="!mb-0">
              <Checkbox>Auto-fill empty fields from URL when saving</Checkbox>
            </Form.Item>
          </div>
        )}

        {previewNote && (
          <p className="mt-0 mb-4 text-xs text-[color:var(--accent)] leading-relaxed">{previewNote}</p>
        )}

        <Form.Item
          name="extractedContent"
          label={excerptLabel}
          rules={
            sourceType === OpportunitySourceType.FORWARDED_EMAIL ||
            sourceType === OpportunitySourceType.MANUAL_ENTRY
              ? [{ required: true, message: 'Paste the useful details so you can find them later' }]
              : undefined
          }
        >
          <Input.TextArea
            rows={5}
            placeholder={
              sourceType === OpportunitySourceType.FORWARDED_EMAIL
                ? 'Paste the subject, sender, and the parts that matter (deadlines, eligibility, links)…'
                : 'Paste the key paragraph or bullet points you want to keep…'
            }
            showCount
            maxLength={20000}
          />
        </Form.Item>

        <Form.Item name="authorityLevel" label="How trustworthy is this source?">
          <Select size="large" options={AUTHORITY_OPTIONS} />
        </Form.Item>

        <Form.Item name="publishedAt" label="Published date (optional)">
          <Input type="date" size="large" />
        </Form.Item>

        <Form.Item name="notes" label="Private notes (optional)">
          <Input.TextArea rows={2} placeholder="Anything else you want to remember about this capture" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
