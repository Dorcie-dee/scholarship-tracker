'use client';

import { PlusOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Modal, Select } from 'antd';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { CardGridSkeleton } from '@/components/LoadingSkeleton';
import { CursorPager } from '@/components/CursorPager';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import {
  OPPORTUNITY_TYPE_OPTIONS,
  STUDY_LEVEL_OPTIONS,
  humanizeEnum,
} from '@/lib/labels';
import {
  OpportunitySourceType,
  OpportunityType,
  SourceAuthorityLevel,
  StudyLevel,
} from '@/lib/shared-types';
import {
  flattenPages,
  useCreateOpportunity,
  useCreateOpportunitySource,
  useOpportunities,
  type OpportunityFilters,
} from '@/lib/queries';
import { friendlyApiMessage } from '@/lib/user-errors';

function OpportunitiesContent() {
  const { message } = App.useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const programmeId = searchParams.get('programmeId') ?? undefined;
  const [studyLevel, setStudyLevel] = useState<string | undefined>();
  const [opportunityType, setOpportunityType] = useState<string | undefined>();
  const [country, setCountry] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const create = useCreateOpportunity();
  const createSource = useCreateOpportunitySource();

  const filters: OpportunityFilters = { programmeId, studyLevel, opportunityType, country };
  const { data, isLoading, isError, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useOpportunities(filters);
  const opportunities = flattenPages(data?.pages);

  const onCreate = async (values: {
    title: string;
    provider?: string;
    opportunityType: OpportunityType;
    country?: string;
    studyLevel?: StudyLevel;
    field?: string;
    fundingType?: string;
    fundingAmount?: string;
    currency?: string;
    applicationUrl?: string;
    eligibilitySummary?: string;
    applicationMethod?: string;
    extractedContent?: string;
  }) => {
    try {
      const opportunity = await create.mutateAsync({
        title: values.title,
        provider: values.provider || undefined,
        opportunityType: values.opportunityType,
        country: values.country || undefined,
        studyLevel: values.studyLevel || undefined,
        field: values.field || undefined,
        fundingType: values.fundingType || undefined,
        fundingAmount: values.fundingAmount || undefined,
        currency: values.currency || undefined,
        applicationUrl: values.applicationUrl || undefined,
        eligibilitySummary: values.eligibilitySummary || undefined,
        applicationMethod: values.applicationMethod || undefined,
      });

      const url = values.applicationUrl?.trim();
      const excerpt = values.extractedContent?.trim();
      if (url || excerpt) {
        await createSource.mutateAsync({
          opportunityId: opportunity.id,
          sourceType: url
            ? OpportunitySourceType.SECONDARY_WEBSITE
            : OpportunitySourceType.MANUAL_ENTRY,
          sourceUrl: url || undefined,
          sourceName: values.title,
          extractedContent: excerpt || undefined,
          authorityLevel: SourceAuthorityLevel.UNVERIFIED,
          autoFetch: Boolean(url && !excerpt),
        });
      }

      setCreateOpen(false);
      form.resetFields();
      message.success('Find recorded');
      router.push(`/opportunities/${opportunity.id}`);
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not record this find'));
    }
  };

  return (
    <div className="app-page space-y-5">
      <PageHeader
        eyebrow="Funding finds"
        title="Opportunities"
        description="Scholarships and funding you are tracking — not a live web crawl. Record a find with a link or pasted article, then open it to manage sources and start an application."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Record a find
          </Button>
        }
      />

      <div className="flex gap-3 flex-wrap">
        <Select
          placeholder="Study level"
          allowClear
          className="w-48"
          size="large"
          value={studyLevel}
          onChange={setStudyLevel}
          options={STUDY_LEVEL_OPTIONS}
          aria-label="Filter by study level"
        />
        <Select
          placeholder="Type"
          allowClear
          className="w-48"
          size="large"
          value={opportunityType}
          onChange={setOpportunityType}
          options={OPPORTUNITY_TYPE_OPTIONS}
          aria-label="Filter by opportunity type"
        />
        <Input
          placeholder="Country"
          allowClear
          className="w-48"
          size="large"
          value={country}
          onChange={(e) => setCountry(e.target.value || undefined)}
          aria-label="Filter by country"
        />
      </div>

      {isLoading ? (
        <CardGridSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : opportunities.length === 0 ? (
        <EmptyState
          title={studyLevel || opportunityType || country || programmeId ? 'No matches for these filters' : 'No funding finds yet'}
          description={
            studyLevel || opportunityType || country || programmeId
              ? 'Try clearing a filter.'
              : 'Record a scholarship you found — paste the page link or an article/email excerpt. This list only shows finds you (or admins) have saved here.'
          }
          action={
            studyLevel || opportunityType || country || programmeId
              ? undefined
              : { label: 'Record a find', onClick: () => setCreateOpen(true) }
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {opportunities.map((o) => (
              <Link key={o.id} href={`/opportunities/${o.id}`} className="block no-underline group">
                <article className="surface-interactive h-full p-5 flex flex-col gap-2">
                  <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--accent)]">
                    {humanizeEnum(o.opportunityType)}
                  </p>
                  <h3
                    className="m-0 text-base font-semibold text-[color:var(--ink)] group-hover:text-[color:var(--accent)] transition-colors leading-snug"
                    style={{ fontFamily: 'var(--font-display), sans-serif' }}
                  >
                    {o.title}
                  </h3>
                  {o.provider && (
                    <p className="m-0 text-sm text-[color:var(--text-muted)] mt-auto pt-2">{o.provider}</p>
                  )}
                </article>
              </Link>
            ))}
          </div>
          <CursorPager
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
          />
        </>
      )}

      <Modal
          title="Record a funding find"
          open={createOpen}
          onCancel={() => setCreateOpen(false)}
          onOk={() => form.submit()}
          confirmLoading={create.isPending}
          okText="Save find"
          destroyOnHidden
          width={560}
        >
          <Form form={form} layout="vertical" onFinish={onCreate} className="!mt-2" requiredMark={false}>
            <Form.Item name="title" label="Title" rules={[{ required: true }]}>
              <Input autoFocus size="large" />
            </Form.Item>
            <Form.Item name="provider" label="Provider">
              <Input size="large" />
            </Form.Item>
            <Form.Item
              name="opportunityType"
              label="Type"
              initialValue={OpportunityType.SCHOLARSHIP}
              rules={[{ required: true }]}
            >
              <Select size="large" options={OPPORTUNITY_TYPE_OPTIONS} />
            </Form.Item>
            <div className="grid sm:grid-cols-2 gap-x-3">
              <Form.Item name="country" label="Country">
                <Input size="large" />
              </Form.Item>
              <Form.Item name="studyLevel" label="Study level">
                <Select allowClear size="large" options={STUDY_LEVEL_OPTIONS} />
              </Form.Item>
            </div>
            <Form.Item name="field" label="Field">
              <Input size="large" />
            </Form.Item>
            <div className="grid sm:grid-cols-3 gap-x-3">
              <Form.Item name="fundingType" label="Funding type">
                <Input size="large" placeholder="e.g. full" />
              </Form.Item>
              <Form.Item name="fundingAmount" label="Amount">
                <Input size="large" placeholder="e.g. 10000" />
              </Form.Item>
              <Form.Item name="currency" label="Currency">
                <Input size="large" placeholder="EUR" />
              </Form.Item>
            </div>
            <Form.Item
              name="applicationUrl"
              label="Website link (where you found it)"
              rules={[{ type: 'url', message: 'Enter a valid URL' }]}
            >
              <Input size="large" placeholder="https://" />
            </Form.Item>
            <Form.Item name="eligibilitySummary" label="Eligibility">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item name="applicationMethod" label="How to apply">
              <Input size="large" />
            </Form.Item>
            <Form.Item
              name="extractedContent"
              label="Paste article / email excerpt (optional)"
              extra="If you paste a link above and leave this empty, we can auto-fetch page text when saving."
            >
              <Input.TextArea rows={4} placeholder="Paste the relevant section…" />
            </Form.Item>
          </Form>
      </Modal>
    </div>
  );
}

export default function OpportunitiesPage() {
  return (
    <Suspense fallback={<CardGridSkeleton />}>
      <OpportunitiesContent />
    </Suspense>
  );
}
