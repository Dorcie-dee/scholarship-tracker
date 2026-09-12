'use client';

import { App, Button, Form, Input } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { AuthShell } from '@/components/AuthShell';

interface LoginFormValues {
  email: string;
  password: string;
}

function describeLoginError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Incorrect email or password.';
    if (error.status === 429) return 'Too many attempts. Please wait a moment and try again.';
    if (error.status >= 500) return 'Something went wrong on our end. Please try again shortly.';
    return error.message;
  }
  return 'Could not reach the server — check your connection and try again.';
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
      message.error(describeLoginError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Log in to your Scholarship OS account.">
      <Form layout="vertical" onFinish={onFinish} disabled={submitting} requiredMark={false}>
        <Form.Item
          name="email"
          label="Email"
          rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
        >
          <Input autoComplete="email" autoFocus size="large" placeholder="you@example.com" />
        </Form.Item>
        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true, message: 'Enter your password' }]}
        >
          <Input.Password autoComplete="current-password" size="large" placeholder="Your password" />
        </Form.Item>
        <Form.Item className="!mb-4 !mt-6">
          <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
            Log in
          </Button>
        </Form.Item>
      </Form>
      <div className="flex items-center justify-between text-sm pt-1">
        <Link href="/forgot-password" className="text-[color:var(--text-secondary)] hover:text-[color:var(--accent)]">
          Forgot password?
        </Link>
        <Link href="/register" className="font-medium text-[color:var(--accent)] hover:text-[color:var(--accent-hover)]">
          Create an account
        </Link>
      </div>
    </AuthShell>
  );
}
