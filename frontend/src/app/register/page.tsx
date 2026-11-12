'use client';

import { App, Button, Form, Input } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { AuthShell } from '@/components/AuthShell';

interface RegisterFormValues {
  name?: string;
  email: string;
  password: string;
}

function describeRegisterError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Too many attempts. Please wait a moment and try again.';
    if (error.status >= 500) return 'Something went wrong on our end. Please try again shortly.';
    return error.message;
  }
  return 'Could not reach the server — check your connection and try again.';
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
      router.replace('/verify-email');
    } catch (error) {
      message.error(describeRegisterError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Start tracking scholarship and admission applications.">
      <Form layout="vertical" onFinish={onFinish} disabled={submitting} requiredMark={false}>
        <Form.Item name="name" label="Name">
          <Input autoComplete="name" autoFocus size="large" placeholder="Your name" />
        </Form.Item>
        <Form.Item
          name="email"
          label="Email"
          rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
        >
          <Input autoComplete="email" size="large" placeholder="you@example.com" />
        </Form.Item>
        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}
        >
          <Input.Password autoComplete="new-password" size="large" placeholder="At least 8 characters" />
        </Form.Item>
        <Form.Item className="!mb-4 !mt-6">
          <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
            Create account
          </Button>
        </Form.Item>
      </Form>
      <p className="m-0 text-center text-sm text-[color:var(--text-secondary)]">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-[color:var(--accent)] hover:text-[color:var(--accent-hover)]">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
