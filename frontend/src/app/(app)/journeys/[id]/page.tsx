'use client';

import { ArrowRightOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Checkbox, DatePicker, Form, Input, Modal, Select, Skeleton } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ListSkeleton } from '@/components/LoadingSkeleton';
import { PageHeader } from '@/components/PageHeader';
import { StatusTag } from '@/components/StatusTag';
import { RecentlyDeletedBanner } from '@/components/application-workspace/RecentlyDeletedBanner';
import {
  APPLICATION_TYPE_OPTIONS,
  JOURNEY_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
  humanizeEnum,
} from '@/lib/labels';
import { ApplicationType, JourneyStatus, TaskPriority, TaskStatus } from '@/lib/shared-types';
import {
  flattenPages,
  useApplications,
  useCreateApplication,
  useCreateTask,
  useDeleteJourney,
  useJourney,
  useOpportunities,
  useProgrammes,
  useTasks,
  useUniversities,
  useUpdateJourney,
  useUpdateTask,
} from '@/lib/queries';
import { friendlyApiMessage } from '@/lib/user-errors';

/**
 * A Journey is the umbrella goal (e.g. "MSc CS — University of Twente"); the
 * real workspace for day-to-day work is each Application's own page
 * (/applications/[id]) — Requirements/Deadlines/Documents/History all live
 * there, scoped to one concrete application, because a Journey can hold
 * several unrelated Applications (an admission + several scholarships) with
 * their own independent requirements and deadlines. This page is the
 * connective hub between them, plus Tasks that aren't tied to any one
 * Application (journey-level tasks — e.g. "decide which scholarships to
 * pursue").
 */
export default function JourneyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { message } = App.useApp();
  const router = useRouter();

  const { data: journey, isLoading: journeyLoading, isError: journeyError, error: journeyErr, refetch: refetchJourney } = useJourney(id);
  const { data: appsData, isLoading: applicationsLoading, isError: appsIsError, error: appsErr, refetch: refetchApps } = useApplications(id);
  const applications = flattenPages(appsData?.pages);
  const { data: tasksData, isLoading: tasksLoading } = useTasks({ journeyId: id });
  const allTasks = flattenPages(tasksData?.pages);
  // Journey-level tasks only — tasks tied to a specific Application show on that Application's own page instead.
  const journeyLevelTasks = allTasks.filter((t) => !t.applicationId);
  const { data: opportunitiesData } = useOpportunities();
  const opportunities = flattenPages(opportunitiesData?.pages);

  const createApplication = useCreateApplication(id);
  const createTask = useCreateTask(id);
  const updateTask = useUpdateTask(id);
  const updateJourney = useUpdateJourney();
  const deleteJourney = useDeleteJourney();

  const [appModalOpen, setAppModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editJourneyOpen, setEditJourneyOpen] = useState(false);
  const [appForm] = Form.useForm();
  const [taskForm] = Form.useForm();
  const [journeyForm] = Form.useForm();
  const editUniversityId = Form.useWatch('universityId', journeyForm) as string | undefined;
  const { data: universitiesData } = useUniversities();
  const universities = flattenPages(universitiesData?.pages);
  const { data: programmesData } = useProgrammes(editUniversityId);
  const programmes = flattenPages(programmesData?.pages);
  const selectedOpportunityId = Form.useWatch('opportunityId', appForm);

  if (journeyLoading) {
    return <Skeleton active />;
  }
  if (journeyError || !journey) {
    return <ErrorState error={journeyErr} onRetry={() => refetchJourney()} title="Couldn't load this journey" />;
  }

  const onCreateApplication = async (values: {
    title: string;
    applicationType?: string;
    opportunityId?: string;
    portal?: string;
    externalUrl?: string;
    notes?: string;
    startDate?: dayjs.Dayjs;
  }) => {
    try {
      await createApplication.mutateAsync({
        title: values.title,
        applicationType: values.applicationType,
        opportunityId: values.opportunityId || undefined,
        portal: values.portal || undefined,
        externalUrl: values.externalUrl || undefined,
        notes: values.notes || undefined,
        startDate: values.startDate?.format('YYYY-MM-DD'),
      });
      setAppModalOpen(false);
      appForm.resetFields();
      message.success(
        values.opportunityId
          ? 'Application created — requirements were copied as a checklist'
          : 'Application created',
      );
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not create application'));
    }
  };

  const onCreateTask = async (values: { title: string; priority?: string; dueDate?: dayjs.Dayjs }) => {
    try {
      await createTask.mutateAsync({
        title: values.title,
        priority: values.priority,
        dueDate: values.dueDate?.format('YYYY-MM-DD'),
      });
      setTaskModalOpen(false);
      taskForm.resetFields();
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not create task'));
    }
  };

  const openEditJourney = () => {
    journeyForm.setFieldsValue({
      title: journey.title,
      goal: journey.goal ?? undefined,
      status: journey.status,
      notes: journey.notes ?? undefined,
      universityId: journey.universityId ?? undefined,
      programmeId: journey.programmeId ?? undefined,
    });
    setEditJourneyOpen(true);
  };

  const onUpdateJourney = async (values: {
    title: string;
    goal?: string;
    status: JourneyStatus;
    notes?: string;
    universityId?: string;
    programmeId?: string;
  }) => {
    try {
      await updateJourney.mutateAsync({
        id,
        title: values.title,
        goal: values.goal || null,
        status: values.status,
        notes: values.notes || null,
        universityId: values.universityId || null,
        programmeId: values.programmeId || null,
      });
      setEditJourneyOpen(false);
      message.success('Journey updated');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not update journey'));
    }
  };

  const onDeleteJourney = async () => {
    try {
      await deleteJourney.mutateAsync(id);
      message.success('Journey removed');
      router.push('/dashboard');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not delete journey'));
    }
  };

  const toggleTask = async (taskId: string, currentStatus: string) => {
    const nextStatus = currentStatus === TaskStatus.DONE ? TaskStatus.TODO : TaskStatus.DONE;
    try {
      await updateTask.mutateAsync({ id: taskId, status: nextStatus });
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not update task'));
    }
  };

  return (
    <div className="app-page space-y-6">
      <PageHeader
        backHref="/dashboard"
        backLabel="Back to dashboard"
        eyebrow="Journey"
        title={journey.title}
        description={
          [journey.goal, journey.university?.name, journey.programme?.name].filter(Boolean).join(' · ') ||
          undefined
        }
        extra={
          <div className="flex items-center gap-2 flex-wrap">
            <StatusTag value={journey.status} />
            <Button icon={<EditOutlined />} onClick={openEditJourney}>
              Edit
            </Button>
            <ConfirmDeleteButton
              title="Delete this journey?"
              description="Applications and journey-level tasks under it will be removed from your workspace."
              onConfirm={() => void onDeleteJourney()}
              loading={deleteJourney.isPending}
            >
              Delete
            </ConfirmDeleteButton>
          </div>
        }
      />

      <RecentlyDeletedBanner journeyId={id} />

      <section className="surface overflow-hidden animate-rise">
        <div className="px-5 py-4 border-b border-[color:var(--border)] flex items-center justify-between gap-3">
          <div>
            <h2
              className="m-0 text-[15px] font-semibold text-[color:var(--ink)]"
              style={{ fontFamily: 'var(--font-display), sans-serif' }}
            >
              Applications
            </h2>
            <p className="mt-0.5 mb-0 text-xs text-[color:var(--text-muted)]">
              Concrete processes under this journey
            </p>
          </div>
          <Button size="small" icon={<PlusOutlined />} onClick={() => setAppModalOpen(true)}>
            New
          </Button>
        </div>
        <div className="p-3 sm:p-4">
          {applicationsLoading ? (
            <ListSkeleton />
          ) : appsIsError ? (
            <ErrorState error={appsErr} onRetry={() => refetchApps()} />
          ) : applications.length === 0 ? (
            <div className="space-y-3">
              <EmptyState
                title="No applications yet"
                description="An application is one concrete process — an admission or a specific scholarship — tied to this journey. To capture where you found funding, open Opportunities, then Capture source on that opportunity."
                action={{ label: 'Start an application', onClick: () => setAppModalOpen(true) }}
              />
              <div className="flex justify-center pb-2">
                <Link href="/opportunities">
                  <Button type="link">Browse opportunities & capture sources</Button>
                </Link>
              </div>
            </div>
          ) : (
            <ul className="m-0 p-0 list-none divide-y divide-[color:var(--border)]">
              {applications.map((application) => (
                <li key={application.id}>
                  <Link
                    href={`/applications/${application.id}`}
                    className="group flex items-center justify-between gap-3 px-3 py-3.5 rounded-xl hover:bg-[color:var(--canvas)] transition-colors no-underline"
                  >
                    <div className="min-w-0">
                      <p
                        className="m-0 text-[15px] font-semibold text-[color:var(--ink)] group-hover:text-[color:var(--accent)] transition-colors truncate"
                        style={{ fontFamily: 'var(--font-display), sans-serif' }}
                      >
                        {application.title}
                      </p>
                      <p className="mt-0.5 mb-0 text-sm text-[color:var(--text-muted)] capitalize">
                        {humanizeEnum(application.applicationType)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusTag value={application.status} />
                      <ArrowRightOutlined className="text-[color:var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity text-xs" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="surface overflow-hidden animate-rise-delay-1">
        <div className="px-5 py-4 border-b border-[color:var(--border)] flex items-center justify-between gap-3">
          <div>
            <h2
              className="m-0 text-[15px] font-semibold text-[color:var(--ink)]"
              style={{ fontFamily: 'var(--font-display), sans-serif' }}
            >
              Journey-level tasks
            </h2>
            <p className="mt-0.5 mb-0 text-xs text-[color:var(--text-muted)]">
              Work not tied to a single application
            </p>
          </div>
          <Button size="small" icon={<PlusOutlined />} onClick={() => setTaskModalOpen(true)}>
            New
          </Button>
        </div>
        <div className="p-3 sm:p-4">
          {tasksLoading ? (
            <ListSkeleton />
          ) : journeyLevelTasks.length === 0 ? (
            <EmptyState
              title="No general tasks yet"
              description="Tasks tied to a specific application show on that application's own page instead."
            />
          ) : (
            <ul className="m-0 p-0 list-none space-y-2">
              {journeyLevelTasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center justify-between gap-3 px-3 py-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]"
                >
                  <label className="flex items-center gap-3 min-w-0 cursor-pointer">
                    <Checkbox
                      checked={task.status === TaskStatus.DONE}
                      onChange={() => void toggleTask(task.id, task.status)}
                    />
                    <span className="min-w-0">
                      <span
                        className={`block text-sm font-medium ${
                          task.status === TaskStatus.DONE
                            ? 'line-through text-[color:var(--text-muted)]'
                            : 'text-[color:var(--ink)]'
                        }`}
                      >
                        {task.title}
                      </span>
                      {task.dueDate && (
                        <span className="block text-xs text-[color:var(--text-muted)] mt-0.5">
                          due {dayjs(task.dueDate).format('MMM D, YYYY')}
                        </span>
                      )}
                    </span>
                  </label>
                  <StatusTag value={task.priority} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Modal
        title="New application"
        open={appModalOpen}
        onCancel={() => setAppModalOpen(false)}
        onOk={() => appForm.submit()}
        confirmLoading={createApplication.isPending}
        okText="Create"
        destroyOnHidden
        width={520}
      >
        <Form form={appForm} layout="vertical" onFinish={onCreateApplication} className="!mt-2" requiredMark={false}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input autoFocus size="large" />
          </Form.Item>
          <Form.Item name="applicationType" label="Type" initialValue={ApplicationType.OTHER}>
            <Select size="large" options={APPLICATION_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="opportunityId"
            label="Linked opportunity"
            extra={
              selectedOpportunityId
                ? 'Requirements from this opportunity will be copied into the new application as a checklist.'
                : undefined
            }
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              size="large"
              placeholder="Optional — pick from the catalog"
              options={opportunities.map((o) => ({ value: o.id, label: o.title }))}
            />
          </Form.Item>
          <Form.Item name="portal" label="Portal">
            <Input size="large" placeholder="e.g. university admissions portal" />
          </Form.Item>
          <Form.Item
            name="externalUrl"
            label="External URL"
            rules={[{ type: 'url', message: 'Enter a valid URL' }]}
          >
            <Input size="large" placeholder="https://" />
          </Form.Item>
          <Form.Item name="startDate" label="Start date">
            <DatePicker className="w-full" size="large" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit journey"
        open={editJourneyOpen}
        onCancel={() => setEditJourneyOpen(false)}
        onOk={() => journeyForm.submit()}
        confirmLoading={updateJourney.isPending}
        okText="Save"
        destroyOnHidden
      >
        <Form
          form={journeyForm}
          layout="vertical"
          onFinish={onUpdateJourney}
          className="!mt-2"
          requiredMark={false}
          onValuesChange={(changed) => {
            if ('universityId' in changed) {
              journeyForm.setFieldValue('programmeId', undefined);
            }
          }}
        >
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="goal" label="Goal">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select size="large" options={JOURNEY_STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="universityId" label="University">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Optional"
              options={universities.map((u) => ({ value: u.id, label: u.name }))}
            />
          </Form.Item>
          <Form.Item name="programmeId" label="Programme">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={editUniversityId ? 'Optional' : 'Choose a university first'}
              disabled={!editUniversityId}
              options={programmes.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="New journey-level task"
        open={taskModalOpen}
        onCancel={() => setTaskModalOpen(false)}
        onOk={() => taskForm.submit()}
        confirmLoading={createTask.isPending}
        okText="Create"
        destroyOnHidden
      >
        <Form form={taskForm} layout="vertical" onFinish={onCreateTask} className="!mt-2" requiredMark={false}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input autoFocus size="large" />
          </Form.Item>
          <Form.Item name="priority" label="Priority" initialValue={TaskPriority.MEDIUM}>
            <Select size="large" options={TASK_PRIORITY_OPTIONS} />
          </Form.Item>
          <Form.Item name="dueDate" label="Due date">
            <DatePicker className="w-full" size="large" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
