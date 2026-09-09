'use client';

import { App, Button, Card, Form, Input, Typography } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

interface RegisterFormValues {
  name?: string;
  email: string;
  password: string;
}

export default function RegisterPage() {
  const { register, status } = useAuth();
  const router = useRouter();
  const { message } = App.useApp();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  const onFinish = async (values: RegisterFormValues) => {
    setSubmitting(true);
    try {
      await register(values.email, values.password, values.name);
      router.replace('/dashboard');
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center min-h-screen px-4">
      <Card className="w-full max-w-sm">
        <Typography.Title level={3} className="!mb-1">
          Create your account
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          Start tracking your scholarship applications.
        </Typography.Paragraph>
        <Form layout="vertical" onFinish={onFinish} disabled={submitting}>
          <Form.Item name="name" label="Name">
            <Input autoComplete="name" autoFocus />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
          >
            <Input autoComplete="email" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={submitting}>
              Create account
            </Button>
          </Form.Item>
        </Form>
        <Typography.Paragraph className="text-center !mb-0">
          Already have an account? <Link href="/login">Log in</Link>
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
