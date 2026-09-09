'use client';

import { PlusOutlined } from '@ant-design/icons';
import { ApplicationType, TaskPriority, TaskStatus } from '@/lib/shared-types';
import {
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { use, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import {
  useApplications,
  useCreateApplication,
  useCreateTask,
  useJourney,
  useTasks,
  useUpdateTaskStatus,
} from '@/lib/queries';

const APPLICATION_STATUS_COLORS: Record<string, string> = {
  not_started: 'default',
  in_progress: 'processing',
  submitted: 'blue',
  under_review: 'gold',
  interview: 'purple',
  offer: 'cyan',
  accepted: 'success',
  rejected: 'error',
  withdrawn: 'default',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'default',
  medium: 'blue',
  high: 'orange',
  urgent: 'red',
};

export default function JourneyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { message } = App.useApp();

  const { data: journey, isLoading: journeyLoading } = useJourney(id);
  const { data: applications, isLoading: applicationsLoading } = useApplications(id);
  const { data: tasks, isLoading: tasksLoading } = useTasks(id);

  const createApplication = useCreateApplication(id);
  const createTask = useCreateTask(id);
  const updateTaskStatus = useUpdateTaskStatus(id);

  const [appModalOpen, setAppModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [appForm] = Form.useForm();
  const [taskForm] = Form.useForm();

  if (journeyLoading || !journey) {
    return <Skeleton active />;
  }

  const onCreateApplication = async (values: { title: string; applicationType?: string }) => {
    try {
      await createApplication.mutateAsync(values);
      setAppModalOpen(false);
      appForm.resetFields();
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : 'Could not create application');
    }
  };

  const onCreateTask = async (values: {
    title: string;
    priority?: string;
    dueDate?: dayjs.Dayjs;
    applicationId?: string;
  }) => {
    try {
      await createTask.mutateAsync({
        title: values.title,
        priority: values.priority,
        applicationId: values.applicationId,
        dueDate: values.dueDate?.format('YYYY-MM-DD'),
      });
      setTaskModalOpen(false);
      taskForm.resetFields();
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : 'Could not create task');
    }
  };

  const toggleTask = async (taskId: string, currentStatus: string) => {
    const nextStatus = currentStatus === TaskStatus.DONE ? TaskStatus.TODO : TaskStatus.DONE;
    try {
      await updateTaskStatus.mutateAsync({ id: taskId, status: nextStatus });
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : 'Could not update task');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Typography.Title level={2} className="!mb-1">
          {journey.title}
        </Typography.Title>
        {journey.goal && <Typography.Paragraph type="secondary">{journey.goal}</Typography.Paragraph>}
      </div>

      <Card
        title="Applications"
        extra={
          <Button size="small" icon={<PlusOutlined />} onClick={() => setAppModalOpen(true)}>
            New
          </Button>
        }
      >
        {applicationsLoading ? (
          <Skeleton active />
        ) : !applications || applications.length === 0 ? (
          <Empty description="No applications yet" />
        ) : (
          <List
            dataSource={applications}
            renderItem={(application) => (
              <List.Item>
                <List.Item.Meta
                  title={application.title}
                  description={application.applicationType.replaceAll('_', ' ')}
                />
                <Tag color={APPLICATION_STATUS_COLORS[application.status] ?? 'default'}>
                  {application.status.replaceAll('_', ' ')}
                </Tag>
              </List.Item>
            )}
          />
        )}
      </Card>

      <Card
        title="Tasks"
        extra={
          <Button size="small" icon={<PlusOutlined />} onClick={() => setTaskModalOpen(true)}>
            New
          </Button>
        }
      >
        {tasksLoading ? (
          <Skeleton active />
        ) : !tasks || tasks.length === 0 ? (
          <Empty description="No tasks yet" />
        ) : (
          <List
            dataSource={tasks}
            renderItem={(task) => (
              <List.Item>
                <Space>
                  <Checkbox
                    checked={task.status === TaskStatus.DONE}
                    onChange={() => void toggleTask(task.id, task.status)}
                  />
                  <span
                    className={task.status === TaskStatus.DONE ? 'line-through text-gray-400' : ''}
                  >
                    {task.title}
                  </span>
                  {task.dueDate && (
                    <Typography.Text type="secondary">
                      due {dayjs(task.dueDate).format('MMM D, YYYY')}
                    </Typography.Text>
                  )}
                </Space>
                <Tag color={PRIORITY_COLORS[task.priority] ?? 'default'}>{task.priority}</Tag>
              </List.Item>
            )}
          />
        )}
      </Card>

      <Modal
        title="New application"
        open={appModalOpen}
        onCancel={() => setAppModalOpen(false)}
        onOk={() => appForm.submit()}
        confirmLoading={createApplication.isPending}
        okText="Create"
      >
        <Form form={appForm} layout="vertical" onFinish={onCreateApplication}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="applicationType" label="Type" initialValue={ApplicationType.OTHER}>
            <Select
              options={Object.values(ApplicationType).map((value) => ({
                value,
                label: value.replaceAll('_', ' '),
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="New task"
        open={taskModalOpen}
        onCancel={() => setTaskModalOpen(false)}
        onOk={() => taskForm.submit()}
        confirmLoading={createTask.isPending}
        okText="Create"
      >
        <Form form={taskForm} layout="vertical" onFinish={onCreateTask}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="priority" label="Priority" initialValue={TaskPriority.MEDIUM}>
            <Select
              options={Object.values(TaskPriority).map((value) => ({ value, label: value }))}
            />
          </Form.Item>
          <Form.Item name="dueDate" label="Due date">
            <DatePicker className="w-full" />
          </Form.Item>
          {applications && applications.length > 0 && (
            <Form.Item name="applicationId" label="Linked application">
              <Select
                allowClear
                options={applications.map((application) => ({
                  value: application.id,
                  label: application.title,
                }))}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
