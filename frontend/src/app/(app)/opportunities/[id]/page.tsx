'use client';

import { EditOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, DatePicker, Form, Input, Modal, Radio, Select, Skeleton } from 'antd';
import dayjs from 'dayjs';
import { use, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/api-client';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ListSkeleton } from '@/components/LoadingSkeleton';
import { PageHeader } from '@/components/PageHeader';
import { StatusTag } from '@/components/StatusTag';
import { CaptureSourceModal } from '@/components/opportunity/CaptureSourceModal';
import { useAuth } from '@/lib/auth-context';
import {
  APPLICATION_TYPE_OPTIONS,
  AUTHORITY_LABELS,
  CONTENT_ORIGIN_LABELS,
  OPPORTUNITY_TYPE_OPTIONS,
  REQUIREMENT_TYPE_OPTIONS,
  SOURCE_TYPE_LABELS,
  STUDY_LEVEL_OPTIONS,
  humanizeEnum,
} from '@/lib/labels';
import {
  ApplicationType,
  OpportunityType,
  RequirementType,
  StudyLevel,
  OpportunitySourceType,
  UserRole,
} from '@/lib/shared-types';
import {
  flattenPages,
  useCreateDeadline,
  useCreateRequirement,
  useDeleteOpportunity,
  useDeleteOpportunitySource,
  useJourneys,
  useOpportunity,
  useOpportunitySources,
  useUpdateOpportunity,
} from '@/lib/queries';
import { friendlyApiMessage } from '@/lib/user-errors';
import type { Application, ApplicationJourney, OpportunitySource } from '@/lib/types';

export default function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN;
  const { data: opportunity, isLoading, isError, error, refetch } = useOpportunity(id);
  const { data: sourcesData, isLoading: sourcesLoading, refetch: refetchSources } =
    useOpportunitySources(id);
  const sources = flattenPages(sourcesData?.pages);
  const { data: journeysData } = useJourneys();
  const journeys = flattenPages(journeysData?.pages);
  const removeSource = useDeleteOpportunitySource(id);
  const updateOpportunity = useUpdateOpportunity();
  const deleteOpportunity = useDeleteOpportunity();
  const createRequirement = useCreateRequirement();
  const createDeadline = useCreateDeadline();

  const [startOpen, setStartOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [requirementOpen, setRequirementOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<OpportunitySource | null>(null);
  const [mode, setMode] = useState<'existing' | 'new'>(journeys.length > 0 ? 'existing' : 'new');
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [requirementForm] = Form.useForm();
  const [deadlineForm] = Form.useForm();

  const startApplication = useMutation({
    mutationFn: async (values: {
      journeyId?: string;
      newJourneyTitle?: string;
      applicationTitle: string;
      applicationType?: ApplicationType;
      portal?: string;
      externalUrl?: string;
      notes?: string;
      startDate?: dayjs.Dayjs;
    }) => {
      const journeyId =
        values.journeyId ??
        (await apiPost<ApplicationJourney>('/journeys', { title: values.newJourneyTitle })).id;
      return apiPost<Application>('/applications', {
        journeyId,
        title: values.applicationTitle,
        opportunityId: id,
        applicationType: values.applicationType,
        portal: values.portal || undefined,
        externalUrl: values.externalUrl || undefined,
        notes: values.notes || undefined,
        startDate: values.startDate?.format('YYYY-MM-DD'),
      });
    },
    onSuccess: (application) => {
      queryClient.invalidateQueries({ queryKey: ['journeys'] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      router.push(`/applications/${application.id}`);
    },
  });

  if (isLoading) return <Skeleton active />;
  if (isError || !opportunity) {
    return <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load this opportunity" />;
  }

  const onStart = async (values: {
    journeyId?: string;
    newJourneyTitle?: string;
    applicationTitle: string;
    applicationType?: ApplicationType;
    portal?: string;
    externalUrl?: string;
    notes?: string;
    startDate?: dayjs.Dayjs;
  }) => {
    try {
      await startApplication.mutateAsync(values);
      message.success('Application started — requirements were copied as a checklist');
    } catch (err) {
      message.error(friendlyApiMessage(err, 'Could not start this application'));
    }
  };

  const openEdit = () => {
    editForm.setFieldsValue({
      title: opportunity.title,
      provider: opportunity.provider ?? undefined,
      opportunityType: opportunity.opportunityType,
      country: opportunity.country ?? undefined,
      studyLevel: opportunity.studyLevel ?? undefined,
      field: opportunity.field ?? undefined,
      fundingType: opportunity.fundingType ?? undefined,
      fundingAmount: opportunity.fundingAmount ?? undefined,
      currency: opportunity.currency ?? undefined,
      applicationUrl: opportunity.applicationUrl ?? undefined,
      eligibilitySummary: opportunity.eligibilitySummary ?? undefined,
      applicationMethod: opportunity.applicationMethod ?? undefined,
    });
    setEditOpen(true);
  };

  const onUpdate = async (values: {
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
  }) => {
    try {
      await updateOpportunity.mutateAsync({
        id,
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
      setEditOpen(false);
      message.success('Opportunity updated');
      void refetch();
    } catch (err) {
      message.error(friendlyApiMessage(err, 'Could not update opportunity'));
    }
  };

  const onDelete = async () => {
    try {
      await deleteOpportunity.mutateAsync(id);
      message.success('Opportunity removed');
      router.push('/opportunities');
    } catch (err) {
      message.error(friendlyApiMessage(err, 'Could not delete opportunity'));
    }
  };

  const onCreateRequirement = async (values: {
    requirementType: RequirementType;
    description: string;
  }) => {
    try {
      await createRequirement.mutateAsync({
        opportunityId: id,
        requirementType: values.requirementType,
        description: values.description,
      });
      setRequirementOpen(false);
      requirementForm.resetFields();
      message.success('Requirement added');
      void refetch();
    } catch (err) {
      message.error(friendlyApiMessage(err, 'Could not add requirement'));
    }
  };

  const onCreateDeadline = async (values: { label: string; date: dayjs.Dayjs }) => {
    try {
      await createDeadline.mutateAsync({
        opportunityId: id,
        label: values.label,
        date: values.date.format('YYYY-MM-DD'),
      });
      setDeadlineOpen(false);
      deadlineForm.resetFields();
      message.success('Deadline added');
      void refetch();
    } catch (err) {
      message.error(friendlyApiMessage(err, 'Could not add deadline'));
    }
  };

  const fundingDisplay = opportunity.fundingAmount
    ? `${opportunity.fundingAmount} ${opportunity.currency ?? ''}`.trim()
    : opportunity.fundingType ?? '—';

  const detailRows: { label: string; value: ReactNode }[] = [
    { label: 'Type', value: <span className="capitalize">{humanizeEnum(opportunity.opportunityType)}</span> },
    { label: 'Country', value: opportunity.country ?? '—' },
    { label: 'Study level', value: opportunity.studyLevel ?? '—' },
    { label: 'Field', value: opportunity.field ?? '—' },
    { label: 'Funding', value: fundingDisplay },
    { label: 'Duration', value: opportunity.duration ?? '—' },
    { label: 'Eligibility', value: opportunity.eligibilitySummary ?? '—' },
    { label: 'How to apply', value: opportunity.applicationMethod ?? '—' },
    {
      label: 'Apply link',
      value: opportunity.applicationUrl ? (
        <a
          href={opportunity.applicationUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[color:var(--accent)] hover:text-[color:var(--accent-hover)] break-all"
        >
          {opportunity.applicationUrl}
        </a>
      ) : (
        '—'
      ),
    },
  ];

  const nestedRequirements = opportunity.requirements ?? [];
  const nestedDeadlines = opportunity.deadlines ?? [];

  return (
    <div className="app-page space-y-6">
      <PageHeader
        backHref="/opportunities"
        backLabel="Back to opportunities"
        eyebrow="Opportunity"
        title={opportunity.title}
        description={opportunity.provider ?? undefined}
        extra={
          <div className="flex flex-wrap gap-2">
            {isAdmin ? (
              <>
                <Button icon={<EditOutlined />} onClick={openEdit}>
                  Edit
                </Button>
                <ConfirmDeleteButton
                  title="Delete this opportunity?"
                  description="Sources and catalog requirements/deadlines on it may also become unavailable."
                  onConfirm={() => void onDelete()}
                  loading={deleteOpportunity.isPending}
                >
                  Delete
                </ConfirmDeleteButton>
              </>
            ) : null}
            <Button icon={<PlusOutlined />} onClick={() => { setEditingSource(null); setCaptureOpen(true); }}>
              Capture source
            </Button>
            <Button type="primary" onClick={() => setStartOpen(true)}>
              Start an application
            </Button>
          </div>
        }
      />

      <section className="surface overflow-hidden animate-rise">
        <div className="px-5 py-4 border-b border-[color:var(--border)]">
          <h2
            className="m-0 text-[15px] font-semibold text-[color:var(--ink)]"
            style={{ fontFamily: 'var(--font-display), sans-serif' }}
          >
            Details
          </h2>
        </div>
        <dl className="m-0 divide-y divide-[color:var(--border)]">
          {detailRows.map((row) => (
            <div key={row.label} className="grid sm:grid-cols-[160px_1fr] gap-1 sm:gap-4 px-5 py-3.5">
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--text-muted)] sm:pt-0.5">
                {row.label}
              </dt>
              <dd className="m-0 text-sm text-[color:var(--ink)] leading-relaxed">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Sources — capture channel */}
      <section className="animate-rise-delay-1 space-y-4">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2
              className="m-0 text-lg font-semibold text-[color:var(--ink)]"
              style={{ fontFamily: 'var(--font-display), sans-serif' }}
            >
              Sources
            </h2>
            <p className="mt-1 mb-0 text-sm text-[color:var(--text-secondary)]">
              Website links, forwarded emails, newsletters, articles, or notes about where you found this.
            </p>
          </div>
          <Button
            type="primary"
            ghost
            icon={<PlusOutlined />}
            onClick={() => { setEditingSource(null); setCaptureOpen(true); }}
          >
            Add source
          </Button>
        </div>

        {sourcesLoading ? (
          <ListSkeleton rows={2} />
        ) : sources.length === 0 ? (
          <EmptyState
            title="No sources captured yet"
            description="Paste a page link, drop in an email excerpt, or save an article snippet so you always know where this came from."
            action={{
              label: 'Capture a source',
              onClick: () => { setEditingSource(null); setCaptureOpen(true); },
            }}
          />
        ) : (
          <div className="space-y-3">
            {sources.map((s) => (
              <article key={s.id} className="surface p-4 sm:p-5 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--accent)]">
                      {SOURCE_TYPE_LABELS[s.sourceType as OpportunitySourceType] ??
                        humanizeEnum(s.sourceType)}
                    </p>
                    <h3
                      className="mt-1 mb-0 text-[15px] font-semibold text-[color:var(--ink)]"
                      style={{ fontFamily: 'var(--font-display), sans-serif' }}
                    >
                      {s.sourceName ?? SOURCE_TYPE_LABELS[s.sourceType as OpportunitySourceType] ?? humanizeEnum(s.sourceType)}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    {s.contentOrigin === 'fetched' && (
                      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold border bg-teal-50 text-teal-800 border-teal-200">
                        {CONTENT_ORIGIN_LABELS.fetched}
                      </span>
                    )}
                    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold border bg-slate-50 text-slate-600 border-slate-200">
                      {AUTHORITY_LABELS[s.authorityLevel] ?? humanizeEnum(s.authorityLevel)}
                    </span>
                  </div>
                </div>
                {s.sourceUrl && (
                  <a
                    href={s.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-[color:var(--accent)] hover:text-[color:var(--accent-hover)] break-all"
                  >
                    <LinkOutlined />
                    {s.sourceUrl}
                  </a>
                )}
                {s.extractedContent && (
                  <div className="rounded-xl bg-[color:var(--canvas)] border border-[color:var(--border)] px-3.5 py-3">
                    <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--text-muted)] mb-1.5">
                      Excerpt
                    </p>
                    <p className="m-0 text-sm text-[color:var(--ink)] whitespace-pre-wrap leading-relaxed">
                      {s.extractedContent}
                    </p>
                  </div>
                )}
                {s.notes && (
                  <p className="m-0 text-sm text-[color:var(--text-secondary)]">
                    <span className="font-medium text-[color:var(--ink)]">Notes: </span>
                    {s.notes}
                  </p>
                )}
                <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-[color:var(--border)]">
                  <p className="m-0 text-xs text-[color:var(--text-muted)]">
                    Captured {dayjs(s.capturedAt).format('MMM D, YYYY')}
                    {s.publishedAt ? ` · Published ${dayjs(s.publishedAt).format('MMM D, YYYY')}` : ''}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="small"
                      onClick={() => {
                        setEditingSource(s);
                        setCaptureOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <ConfirmDeleteButton
                      size="small"
                      title="Remove this source?"
                      description="This only deletes the capture record — the opportunity itself stays."
                      onConfirm={async () => {
                        try {
                          await removeSource.mutateAsync(s.id);
                          message.success('Source removed');
                          void refetchSources();
                        } catch (err) {
                          message.error(friendlyApiMessage(err, 'Could not remove this source'));
                        }
                      }}
                      loading={removeSource.isPending}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Catalog requirements / deadlines from opportunity detail */}
      <div className="grid gap-6 lg:grid-cols-2 animate-rise-delay-2">
        <section className="surface overflow-hidden">
          <div className="px-5 py-4 border-b border-[color:var(--border)] flex items-start justify-between gap-3">
            <div>
              <h2 className="m-0 text-[15px] font-semibold text-[color:var(--ink)]">Typical requirements</h2>
              <p className="mt-1 mb-0 text-xs text-[color:var(--text-muted)]">
                Copied into your application when you start one from this opportunity.
              </p>
            </div>
            {isAdmin ? (
              <Button size="small" icon={<PlusOutlined />} onClick={() => setRequirementOpen(true)}>
                Add requirement
              </Button>
            ) : null}
          </div>
          <div className="p-3">
            {nestedRequirements.length === 0 ? (
              <p className="m-0 px-2 py-6 text-sm text-center text-[color:var(--text-muted)]">
                No requirements listed on this opportunity yet.
              </p>
            ) : (
              <ul className="m-0 p-0 list-none divide-y divide-[color:var(--border)]">
                {nestedRequirements.map((r) => (
                  <li key={r.id} className="px-2 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="m-0 text-sm font-medium text-[color:var(--ink)]">{r.description}</p>
                        <p className="mt-1 mb-0 text-xs text-[color:var(--text-muted)] capitalize">
                          {humanizeEnum(r.requirementType)}
                        </p>
                      </div>
                      <StatusTag value={r.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="surface overflow-hidden">
          <div className="px-5 py-4 border-b border-[color:var(--border)] flex items-start justify-between gap-3">
            <div>
              <h2 className="m-0 text-[15px] font-semibold text-[color:var(--ink)]">Published deadlines</h2>
              <p className="mt-1 mb-0 text-xs text-[color:var(--text-muted)]">
                Not copied automatically — add the ones you need inside your application.
              </p>
            </div>
            {isAdmin ? (
              <Button size="small" icon={<PlusOutlined />} onClick={() => setDeadlineOpen(true)}>
                Add deadline
              </Button>
            ) : null}
          </div>
          <div className="p-3">
            {nestedDeadlines.length === 0 ? (
              <p className="m-0 px-2 py-6 text-sm text-center text-[color:var(--text-muted)]">
                No deadlines listed on this opportunity yet.
              </p>
            ) : (
              <ul className="m-0 p-0 list-none divide-y divide-[color:var(--border)]">
                {nestedDeadlines.map((d) => (
                  <li key={d.id} className="px-2 py-3 flex items-start justify-between gap-2">
                    <div>
                      <p className="m-0 text-sm font-medium text-[color:var(--ink)]">{d.label}</p>
                      <p className="mt-1 mb-0 text-xs text-[color:var(--text-muted)]">
                        {dayjs(d.date).format('MMM D, YYYY')}
                        {d.deadlineType ? ` · ${humanizeEnum(d.deadlineType)}` : ''}
                      </p>
                    </div>
                    <StatusTag value={d.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <CaptureSourceModal
        opportunityId={id}
        open={captureOpen}
        editing={editingSource}
        onClose={() => {
          setCaptureOpen(false);
          setEditingSource(null);
        }}
      />

      {isAdmin ? (
        <>
          <Modal
            title="Edit opportunity"
            open={editOpen}
            onCancel={() => setEditOpen(false)}
            onOk={() => editForm.submit()}
            confirmLoading={updateOpportunity.isPending}
            okText="Save"
            destroyOnHidden
            width={560}
          >
            <Form form={editForm} layout="vertical" onFinish={onUpdate} className="!mt-2" requiredMark={false}>
              <Form.Item name="title" label="Title" rules={[{ required: true }]}>
                <Input autoFocus size="large" />
              </Form.Item>
              <Form.Item name="provider" label="Provider">
                <Input size="large" />
              </Form.Item>
              <Form.Item name="opportunityType" label="Type" rules={[{ required: true }]}>
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
                label="Application URL"
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
            </Form>
          </Modal>

          <Modal
            title="Add requirement"
            open={requirementOpen}
            onCancel={() => setRequirementOpen(false)}
            onOk={() => requirementForm.submit()}
            confirmLoading={createRequirement.isPending}
            okText="Add"
            destroyOnHidden
          >
            <Form
              form={requirementForm}
              layout="vertical"
              onFinish={onCreateRequirement}
              className="!mt-2"
              requiredMark={false}
            >
              <Form.Item
                name="requirementType"
                label="Type"
                initialValue={RequirementType.OTHER}
                rules={[{ required: true }]}
              >
                <Select size="large" options={REQUIREMENT_TYPE_OPTIONS} />
              </Form.Item>
              <Form.Item name="description" label="Description" rules={[{ required: true }]}>
                <Input.TextArea rows={2} autoFocus />
              </Form.Item>
            </Form>
          </Modal>

          <Modal
            title="Add deadline"
            open={deadlineOpen}
            onCancel={() => setDeadlineOpen(false)}
            onOk={() => deadlineForm.submit()}
            confirmLoading={createDeadline.isPending}
            okText="Add"
            destroyOnHidden
          >
            <Form
              form={deadlineForm}
              layout="vertical"
              onFinish={onCreateDeadline}
              className="!mt-2"
              requiredMark={false}
            >
              <Form.Item name="label" label="Label" rules={[{ required: true }]}>
                <Input autoFocus size="large" />
              </Form.Item>
              <Form.Item name="date" label="Date" rules={[{ required: true }]}>
                <DatePicker className="w-full" size="large" />
              </Form.Item>
            </Form>
          </Modal>
        </>
      ) : null}

      <Modal
        title="Start an application"
        open={startOpen}
        onCancel={() => setStartOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={startApplication.isPending}
        okText="Start application"
        width={520}
        destroyOnHidden
      >
        <p className="mt-0 mb-4 text-sm text-[color:var(--text-secondary)] leading-relaxed">
          We’ll create the application under a journey and copy this opportunity’s requirements into
          your checklist. Deadlines are not copied — add those yourself if you need them.
        </p>
        <Form
          form={form}
          layout="vertical"
          onFinish={onStart}
          initialValues={{
            applicationTitle: opportunity.title,
            applicationType: ApplicationType.EXTERNAL_SCHOLARSHIP,
            externalUrl: opportunity.applicationUrl ?? undefined,
          }}
          requiredMark={false}
        >
          <Form.Item name="applicationTitle" label="Application title" rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="applicationType" label="Application type">
            <Select size="large" options={APPLICATION_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item label="Journey">
            <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
              <Radio value="existing" disabled={journeys.length === 0}>
                Add to an existing journey
              </Radio>
              <Radio value="new">Start a new journey</Radio>
            </Radio.Group>
          </Form.Item>
          {mode === 'existing' ? (
            <Form.Item name="journeyId" rules={[{ required: mode === 'existing', message: 'Choose a journey' }]}>
              <Select
                placeholder="Choose a journey"
                size="large"
                options={journeys.map((j) => ({ value: j.id, label: j.title }))}
              />
            </Form.Item>
          ) : (
            <Form.Item
              name="newJourneyTitle"
              rules={[{ required: mode === 'new', message: 'Give the journey a title' }]}
              initialValue={opportunity.title}
            >
              <Input placeholder="Journey title" size="large" />
            </Form.Item>
          )}
          <Form.Item name="startDate" label="Start date (optional)">
            <DatePicker className="w-full" size="large" />
          </Form.Item>
          <Form.Item
            name="externalUrl"
            label="Application portal URL (optional)"
            rules={[{ type: 'url', message: 'Enter a valid URL' }]}
          >
            <Input size="large" placeholder="https://" />
          </Form.Item>
          <Form.Item name="portal" label="Portal name (optional)">
            <Input size="large" placeholder="e.g. university portal" />
          </Form.Item>
          <Form.Item name="notes" label="Notes (optional)">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
