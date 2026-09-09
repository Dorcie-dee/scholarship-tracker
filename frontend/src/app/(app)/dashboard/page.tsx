'use client';

import { PlusOutlined } from '@ant-design/icons';
import { App, Button, Card, Empty, Form, Input, Modal, Spin, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { useCreateJourney, useJourneys } from '@/lib/queries';

const STATUS_COLORS: Record<string, string> = {
  planning: 'default',
  active: 'processing',
  on_hold: 'warning',
  completed: 'success',
  abandoned: 'error',
};

export default function DashboardPage() {
  const { data: journeys, isLoading } = useJourneys();
  const createJourney = useCreateJourney();
  const { message } = App.useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const onCreate = async (values: { title: string; goal?: string }) => {
    try {
      await createJourney.mutateAsync(values);
      setModalOpen(false);
      form.resetFields();
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : 'Could not create journey');
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Typography.Title level={2} className="!mb-0">
          Your journeys
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          New journey
        </Button>
      </div>

      {isLoading ? (
        <Spin />
      ) : !journeys || journeys.length === 0 ? (
        <Empty description="No journeys yet — create one to get started" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {journeys.map((journey) => (
            <Link key={journey.id} href={`/journeys/${journey.id}`}>
              <Card hoverable title={journey.title}>
                <Tag color={STATUS_COLORS[journey.status] ?? 'default'}>{journey.status}</Tag>
                {journey.goal && (
                  <Typography.Paragraph type="secondary" className="!mt-2 !mb-0" ellipsis={{ rows: 2 }}>
                    {journey.goal}
                  </Typography.Paragraph>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal
        title="New journey"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createJourney.isPending}
        okText="Create"
      >
        <Form form={form} layout="vertical" onFinish={onCreate}>
          <Form.Item
            name="title"
            label="Title"
            rules={[{ required: true, message: 'Give this journey a title' }]}
          >
            <Input placeholder="e.g. MSc Computer Science — University of Twente" autoFocus />
          </Form.Item>
          <Form.Item name="goal" label="Goal">
            <Input.TextArea rows={3} placeholder="What are you trying to achieve?" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
