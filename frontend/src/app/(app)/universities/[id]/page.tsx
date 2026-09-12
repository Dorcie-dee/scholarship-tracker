'use client';

import { ArrowRightOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Modal, Select, Skeleton } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useState, type ReactNode } from 'react';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { CardGridSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth-context';
import { STUDY_LEVEL_OPTIONS } from '@/lib/labels';
import { StudyLevel, UserRole } from '@/lib/shared-types';
import {
  flattenPages,
  useCreateProgramme,
  useDeleteProgramme,
  useDeleteUniversity,
  useProgrammes,
  useUniversity,
  useUpdateProgramme,
  useUpdateUniversity,
} from '@/lib/queries';
import { friendlyApiMessage } from '@/lib/user-errors';
import type { Programme } from '@/lib/types';

export default function UniversityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { message } = App.useApp();
  const router = useRouter();
  const isAdmin = user?.role === UserRole.ADMIN;

  const { data: university, isLoading, isError, error, refetch } = useUniversity(id);
  const { data: progData, isLoading: progLoading, isError: progIsError, error: progErr, refetch: refetchProg } =
    useProgrammes(id);
  const programmes = flattenPages(progData?.pages);

  const createProgramme = useCreateProgramme();
  const updateProgramme = useUpdateProgramme();
  const deleteProgramme = useDeleteProgramme();
  const updateUniversity = useUpdateUniversity();
  const deleteUniversity = useDeleteUniversity();

  const [createProgOpen, setCreateProgOpen] = useState(false);
  const [editUniOpen, setEditUniOpen] = useState(false);
  const [editingProgramme, setEditingProgramme] = useState<Programme | null>(null);
  const [createForm] = Form.useForm();
  const [editUniForm] = Form.useForm();
  const [editProgForm] = Form.useForm();

  if (isLoading) return <Skeleton active />;
  if (isError || !university) {
    return <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load this university" />;
  }

  const onCreateProgramme = async (values: {
    name: string;
    studyLevel?: string;
    field?: string;
    notes?: string;
  }) => {
    try {
      await createProgramme.mutateAsync({ universityId: id, ...values, notes: values.notes || undefined });
      setCreateProgOpen(false);
      createForm.resetFields();
      message.success('Programme added');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not add programme'));
    }
  };

  const openEditUniversity = () => {
    editUniForm.setFieldsValue({
      name: university.name,
      country: university.country ?? undefined,
      website: university.website ?? undefined,
      notes: university.notes ?? undefined,
    });
    setEditUniOpen(true);
  };

  const onUpdateUniversity = async (values: {
    name: string;
    country?: string;
    website?: string;
    notes?: string;
  }) => {
    try {
      await updateUniversity.mutateAsync({
        id,
        name: values.name,
        country: values.country || null,
        website: values.website || null,
        notes: values.notes || null,
      });
      setEditUniOpen(false);
      message.success('University updated');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not update university'));
    }
  };

  const onDeleteUniversity = async () => {
    try {
      await deleteUniversity.mutateAsync(id);
      message.success('University removed');
      router.push('/universities');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not delete university'));
    }
  };

  const openEditProgramme = (p: Programme) => {
    editProgForm.setFieldsValue({
      name: p.name,
      studyLevel: p.studyLevel ?? undefined,
      field: p.field ?? undefined,
      notes: p.notes ?? undefined,
    });
    setEditingProgramme(p);
  };

  const onUpdateProgramme = async (values: {
    name: string;
    studyLevel?: StudyLevel;
    field?: string;
    notes?: string;
  }) => {
    if (!editingProgramme) return;
    try {
      await updateProgramme.mutateAsync({
        id: editingProgramme.id,
        name: values.name,
        studyLevel: values.studyLevel ?? null,
        field: values.field || null,
        notes: values.notes || null,
      });
      setEditingProgramme(null);
      message.success('Programme updated');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not update programme'));
    }
  };

  const detailRows: { label: string; value: ReactNode }[] = [
    {
      label: 'Website',
      value: university.website ? (
        <a
          href={university.website}
          target="_blank"
          rel="noreferrer"
          className="text-[color:var(--accent)] hover:text-[color:var(--accent-hover)] break-all"
        >
          {university.website}
        </a>
      ) : (
        '—'
      ),
    },
    { label: 'Notes', value: university.notes ?? '—' },
  ];

  return (
    <div className="app-page space-y-6">
      <PageHeader
        backHref="/universities"
        backLabel="Back to universities"
        eyebrow="University"
        title={university.name}
        description={university.country ?? undefined}
        extra={
          isAdmin ? (
            <div className="flex gap-2 flex-wrap">
              <Button icon={<EditOutlined />} onClick={openEditUniversity}>
                Edit
              </Button>
              <ConfirmDeleteButton
                title="Delete this university?"
                description="Programmes under it may also become unavailable."
                onConfirm={() => void onDeleteUniversity()}
                loading={deleteUniversity.isPending}
              >
                Delete
              </ConfirmDeleteButton>
            </div>
          ) : undefined
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

      <section className="animate-rise-delay-1">
        <div className="flex items-end justify-between gap-3 mb-4">
          <div>
            <h2
              className="m-0 text-lg font-semibold text-[color:var(--ink)]"
              style={{ fontFamily: 'var(--font-display), sans-serif' }}
            >
              Programmes
            </h2>
            <p className="mt-1 mb-0 text-sm text-[color:var(--text-secondary)]">
              Browse programmes and jump to related opportunities.
            </p>
          </div>
          {isAdmin ? (
            <Button size="small" icon={<PlusOutlined />} onClick={() => setCreateProgOpen(true)}>
              Add
            </Button>
          ) : null}
        </div>

        {progLoading ? (
          <CardGridSkeleton count={3} />
        ) : progIsError ? (
          <ErrorState error={progErr} onRetry={() => refetchProg()} />
        ) : programmes.length === 0 ? (
          <EmptyState title="No programmes listed for this university yet" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {programmes.map((p) => (
              <article key={p.id} className="surface-interactive h-full p-5 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--accent)]">
                    Programme
                  </p>
                  {isAdmin ? (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openEditProgramme(p)}
                        aria-label={`Edit ${p.name}`}
                      />
                      <ConfirmDeleteButton
                        size="small"
                        title="Remove this programme?"
                        onConfirm={() =>
                          deleteProgramme.mutate(p.id, {
                            onError: (err) =>
                              message.error(friendlyApiMessage(err, 'Could not delete programme')),
                          })
                        }
                        loading={deleteProgramme.isPending}
                      />
                    </div>
                  ) : (
                    <ArrowRightOutlined className="text-[color:var(--text-muted)] text-xs mt-0.5" />
                  )}
                </div>
                <Link href={`/opportunities?programmeId=${p.id}`} className="block no-underline group flex-1">
                  <h3
                    className="m-0 text-base font-semibold text-[color:var(--ink)] group-hover:text-[color:var(--accent)] transition-colors leading-snug"
                    style={{ fontFamily: 'var(--font-display), sans-serif' }}
                  >
                    {p.name}
                  </h3>
                  {p.studyLevel && (
                    <p className="mt-2 mb-0 text-sm text-[color:var(--text-muted)]">{p.studyLevel}</p>
                  )}
                  {p.notes && (
                    <p className="mt-1 mb-0 text-sm text-[color:var(--text-secondary)] line-clamp-2">{p.notes}</p>
                  )}
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <Modal
        title="Add programme"
        open={createProgOpen}
        onCancel={() => setCreateProgOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={createProgramme.isPending}
        okText="Add"
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={onCreateProgramme} className="!mt-2" requiredMark={false}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input autoFocus size="large" />
          </Form.Item>
          <Form.Item name="studyLevel" label="Study level">
            <Select allowClear size="large" options={STUDY_LEVEL_OPTIONS} />
          </Form.Item>
          <Form.Item name="field" label="Field">
            <Input size="large" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit university"
        open={editUniOpen}
        onCancel={() => setEditUniOpen(false)}
        onOk={() => editUniForm.submit()}
        confirmLoading={updateUniversity.isPending}
        okText="Save"
        destroyOnHidden
      >
        <Form form={editUniForm} layout="vertical" onFinish={onUpdateUniversity} className="!mt-2" requiredMark={false}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="country" label="Country">
            <Input size="large" />
          </Form.Item>
          <Form.Item name="website" label="Website" rules={[{ type: 'url', message: 'Enter a valid URL' }]}>
            <Input size="large" placeholder="https://" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit programme"
        open={Boolean(editingProgramme)}
        onCancel={() => setEditingProgramme(null)}
        onOk={() => editProgForm.submit()}
        confirmLoading={updateProgramme.isPending}
        okText="Save"
        destroyOnHidden
      >
        <Form form={editProgForm} layout="vertical" onFinish={onUpdateProgramme} className="!mt-2" requiredMark={false}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="studyLevel" label="Study level">
            <Select allowClear size="large" options={STUDY_LEVEL_OPTIONS} />
          </Form.Item>
          <Form.Item name="field" label="Field">
            <Input size="large" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
