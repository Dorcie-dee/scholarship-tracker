'use client';

import { App, Button, Card, Form, Input, Typography } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

interface LoginFormValues {
  email: string;
  password: string;
}

export default function LoginPage() {
  const { login, status } = useAuth();
  const router = useRouter();
  const { message } = App.useApp();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  const onFinish = async (values: LoginFormValues) => {
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      router.replace('/dashboard');
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center min-h-screen px-4">
      <Card className="w-full max-w-sm">
        <Typography.Title level={3} className="!mb-1">
          Welcome back
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          Log in to your Scholarship OS account.
        </Typography.Paragraph>
        <Form layout="vertical" onFinish={onFinish} disabled={submitting}>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
          >
            <Input autoComplete="email" autoFocus />
          </Form.Item>
          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, message: 'Enter your password' }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={submitting}>
              Log in
            </Button>
          </Form.Item>
        </Form>
        <Typography.Paragraph className="text-center !mb-0">
          No account yet? <Link href="/register">Create one</Link>
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
