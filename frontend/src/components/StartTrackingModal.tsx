'use client';

import { App, Button, Checkbox, Form, Input, Modal } from 'antd';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/lib/api-client';
import {
  useCreateJourney,
  useCreateOpportunity,
  useCreateOpportunitySource,
  useFetchUrlPreview,
} from '@/lib/queries';
import {
  ApplicationType,
  OpportunitySourceType,
  OpportunityType,
  SourceAuthorityLevel,
} from '@/lib/shared-types';
import { friendlyApiMessage } from '@/lib/user-errors';
import type { Application } from '@/lib/types';

type FormValues = {
  journeyTitle: string;
  goal?: string;
  recordFind: boolean;
  opportunityTitle?: string;
  sourceUrl?: string;
  extractedContent?: string;
  autoFetch?: boolean;
};

/**
 * Dashboard primary entry: start a journey and (by default) record the funding
 * find — URL and/or pasted article/email — then open an application workspace.
 */
export function StartTrackingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const recordFind = Form.useWatch('recordFind', form) ?? true;
  const [submitting, setSubmitting] = useState(false);

  const createJourney = useCreateJourney();
  const createOpportunity = useCreateOpportunity();
  const createSource = useCreateOpportunitySource();
  const fetchPreview = useFetchUrlPreview();

  const resetAndClose = () => {
    form.resetFields();
    onClose();
  };

  const onPreview = async () => {
    const url = (form.getFieldValue('sourceUrl') as string | undefined)?.trim();
    if (!url) {
      message.warning('Paste a website link first');
      return;
    }
    try {
      const preview = await fetchPreview.mutateAsync(url);
      const current = form.getFieldsValue();
      form.setFieldsValue({
        opportunityTitle:
          current.opportunityTitle?.trim() || preview.title || current.opportunityTitle,
        extractedContent:
          current.extractedContent?.trim() ||
          preview.extractedContent ||
          current.extractedContent,
      });
      message.success('Page preview loaded — empty fields were filled');
    } catch (err) {
      message.error(friendlyApiMessage(err, 'Could not fetch that page'));
    }
  };

  const onFinish = async (values: FormValues) => {
    const journeyTitle = values.journeyTitle.trim();
    const sourceUrl = values.sourceUrl?.trim();
    const extractedContent = values.extractedContent?.trim();
    const wantsFind = values.recordFind !== false;
    const hasSourceMaterial = Boolean(sourceUrl || extractedContent);
    const opportunityTitle =
      values.opportunityTitle?.trim() || (hasSourceMaterial ? journeyTitle : undefined);

    if (wantsFind && hasSourceMaterial && !opportunityTitle) {
      message.warning('Add a name for the scholarship or funding you found');
      return;
    }

    setSubmitting(true);
    try {
      const journey = await createJourney.mutateAsync({
        title: journeyTitle,
        goal: values.goal?.trim() || undefined,
      });

      if (wantsFind && opportunityTitle) {
        const opportunity = await createOpportunity.mutateAsync({
          title: opportunityTitle,
          opportunityType: OpportunityType.SCHOLARSHIP,
          applicationUrl: sourceUrl || undefined,
        });

        if (sourceUrl || extractedContent) {
          await createSource.mutateAsync({
            opportunityId: opportunity.id,
            sourceType: sourceUrl
              ? OpportunitySourceType.SECONDARY_WEBSITE
              : OpportunitySourceType.MANUAL_ENTRY,
            sourceUrl: sourceUrl || undefined,
            sourceName: opportunityTitle,
            extractedContent: extractedContent || undefined,
            authorityLevel: SourceAuthorityLevel.UNVERIFIED,
            autoFetch: Boolean(values.autoFetch && sourceUrl && !extractedContent),
          });
        }

        const application = await apiPost<Application>('/applications', {
          journeyId: journey.id,
          title: opportunityTitle,
          opportunityId: opportunity.id,
          applicationType: ApplicationType.EXTERNAL_SCHOLARSHIP,
          externalUrl: sourceUrl || undefined,
        });

        await queryClient.invalidateQueries({ queryKey: ['applications'] });
        await queryClient.invalidateQueries({ queryKey: ['opportunities'] });
        await queryClient.invalidateQueries({ queryKey: ['journeys'] });

        message.success('Tracking started — your find is saved and an application is open');
        resetAndClose();
        router.push(`/applications/${application.id}`);
        return;
      }

      message.success('Journey created — add a funding find when you have one');
      resetAndClose();
      router.push(`/journeys/${journey.id}`);
    } catch (err) {
      message.error(friendlyApiMessage(err, 'Could not start tracking'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Start tracking"
      open={open}
      onCancel={resetAndClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText={recordFind ? 'Start with this find' : 'Create journey only'}
      width={560}
      destroyOnHidden
    >
      <p className="mt-0 mb-4 text-sm text-[color:var(--text-secondary)] leading-relaxed">
        A journey is your goal (for example an MSc). If you already found a scholarship page,
        article, or email, paste it here — we save that find and open an application under the
        journey.
      </p>

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        requiredMark={false}
        initialValues={{ recordFind: true, autoFetch: true }}
      >
        <Form.Item
          name="journeyTitle"
          label="Journey title"
          rules={[{ required: true, message: 'Name this journey' }]}
        >
          <Input
            size="large"
            placeholder="e.g. MSc Computer Science — University of Twente"
            autoFocus
          />
        </Form.Item>
        <Form.Item name="goal" label="Goal (optional)">
          <Input.TextArea rows={2} placeholder="What are you trying to achieve?" />
        </Form.Item>

        <Form.Item name="recordFind" valuePropName="checked" className="!mb-3">
          <Checkbox>I already found a scholarship / funding page</Checkbox>
        </Form.Item>

        {recordFind ? (
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--canvas)] p-4 mb-2">
            <p className="m-0 mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-[color:var(--accent)]">
              Your find
            </p>
            <Form.Item
              name="opportunityTitle"
              label="Scholarship / funding name"
              extra="If blank, we reuse the journey title when you paste a link or excerpt."
            >
              <Input size="large" placeholder="e.g. Orange Tulip Scholarship" />
            </Form.Item>
            <Form.Item
              name="sourceUrl"
              label="Website link"
              rules={[{ type: 'url', message: 'Include https://' }]}
            >
              <Input size="large" placeholder="https://…" />
            </Form.Item>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <Button onClick={() => void onPreview()} loading={fetchPreview.isPending}>
                Preview page
              </Button>
              <Form.Item name="autoFetch" valuePropName="checked" className="!mb-0">
                <Checkbox>Auto-fetch page text when saving (if excerpt empty)</Checkbox>
              </Form.Item>
            </div>
            <Form.Item
              name="extractedContent"
              label="Paste article / email excerpt"
              extra="Optional if you have a link. Useful for newsletters and forwarded emails."
            >
              <Input.TextArea
                rows={5}
                placeholder="Paste the relevant section from an article, newsletter, or email…"
              />
            </Form.Item>
          </div>
        ) : (
          <p className="m-0 mb-2 text-sm text-[color:var(--text-muted)] leading-relaxed">
            You can add a funding find later from Opportunities → Record a find, or from this
            journey when you start an application.
          </p>
        )}
      </Form>
    </Modal>
  );
}
