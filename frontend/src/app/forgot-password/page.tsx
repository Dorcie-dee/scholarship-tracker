'use client';

import { App, Button, Form, Input } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { useForgotPassword } from '@/lib/queries';
import { AuthShell } from '@/components/AuthShell';

export default function ForgotPasswordPage() {
  const { message } = App.useApp();
  const forgotPassword = useForgotPassword();
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = async (values: { email: string }) => {
    try {
      await forgotPassword.mutateAsync(values);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 429) {
        message.error('Something went wrong. Please try again.');
        return;
      }
      message.error('Too many attempts. Please wait a moment and try again.');
      return;
    }
    setSubmitted(true);
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle={
        submitted
          ? undefined
          : "Enter your email and we'll send a reset link, if an account exists for it."
      }
    >
      {submitted ? (
        <p className="m-0 text-[15px] text-[color:var(--text-secondary)] leading-relaxed">
          If an account exists for that email, we&apos;ve sent a link to reset your password.
        </p>
      ) : (
        <Form layout="vertical" onFinish={onSubmit} disabled={forgotPassword.isPending} requiredMark={false}>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
          >
            <Input autoComplete="email" autoFocus size="large" placeholder="you@example.com" />
          </Form.Item>
          <Form.Item className="!mb-0 !mt-6">
            <Button type="primary" htmlType="submit" block size="large" loading={forgotPassword.isPending}>
              Send reset link
            </Button>
          </Form.Item>
        </Form>
      )}
      <p className="mt-6 mb-0 text-center text-sm">
        <Link href="/login" className="text-[color:var(--accent)] hover:text-[color:var(--accent-hover)]">
          Back to login
        </Link>
      </p>
    </AuthShell>
  );
}
