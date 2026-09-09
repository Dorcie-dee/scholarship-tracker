'use client';

import { App, Button, Card, Form, Input, Skeleton, Typography } from 'antd';
import { useEffect } from 'react';
import { ApiError } from '@/lib/api-client';
import { useProfile, useUpdateProfile } from '@/lib/queries';

interface ProfileFormValues {
  nationality?: string;
  summary?: string;
}

export default function ProfilePage() {
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const { message } = App.useApp();
  const [form] = Form.useForm<ProfileFormValues>();

  useEffect(() => {
    if (profile) {
      form.setFieldsValue({
        nationality: profile.nationality ?? undefined,
        summary: profile.summary ?? undefined,
      });
    }
  }, [profile, form]);

  const onFinish = async (values: ProfileFormValues) => {
    try {
      await updateProfile.mutateAsync(values);
      message.success('Profile updated');
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : 'Could not update profile');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Typography.Title level={2}>Your profile</Typography.Title>
      <Card>
        {isLoading ? (
          <Skeleton active />
        ) : (
          <Form form={form} layout="vertical" onFinish={onFinish}>
            <Form.Item name="nationality" label="Nationality">
              <Input />
            </Form.Item>
            <Form.Item name="summary" label="Summary">
              <Input.TextArea rows={4} placeholder="A short summary about your academic background and goals" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={updateProfile.isPending}>
              Save
            </Button>
          </Form>
        )}
      </Card>

      {profile && profile.education.length > 0 && (
        <Card title="Education">
          {profile.education.map((entry, index) => (
            <Typography.Paragraph key={index}>
              {Object.entries(entry)
                .map(([key, value]) => `${key}: ${String(value)}`)
                .join(' · ')}
            </Typography.Paragraph>
          ))}
        </Card>
      )}
    </div>
  );
}
