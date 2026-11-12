'use client';

import { App, Button, Form, Input, Result } from 'antd';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ApiError } from '@/lib/api-client';
import { useResetPassword } from '@/lib/queries';
import { AuthShell } from '@/components/AuthShell';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const router = useRouter();
  const { message } = App.useApp();
  const resetPassword = useResetPassword();

  if (!token) {
    return (
      <Result
        status="error"
        title="Invalid reset link"
        subTitle="This link is missing its reset token. Request a new one."
        extra={
          <Link href="/forgot-password">
            <Button type="primary">Request a new link</Button>
          </Link>
        }
      />
    );
  }

  const onSubmit = async (values: { newPassword: string }) => {
    try {
      await resetPassword.mutateAsync({ token, newPassword: values.newPassword });
      message.success('Password reset — please log in with your new password');
      router.replace('/login');
    } catch (error) {
      message.error(
        error instanceof ApiError
          ? error.message
          : 'This link may have expired. Request a new one.',
      );
    }
  };

  return (
    <Form layout="vertical" onFinish={onSubmit} disabled={resetPassword.isPending} requiredMark={false}>
      <Form.Item
        name="newPassword"
        label="New password"
        rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}
      >
        <Input.Password autoComplete="new-password" autoFocus size="large" placeholder="At least 8 characters" />
      </Form.Item>
      <Form.Item className="!mb-0 !mt-6">
        <Button type="primary" htmlType="submit" block size="large" loading={resetPassword.isPending}>
          Reset password
        </Button>
      </Form.Item>
    </Form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password" subtitle="Pick something memorable and secure.">
      <Suspense fallback={<div className="h-40 animate-pulse surface" />}>
        <ResetPasswordContent />
      </Suspense>
    </AuthShell>
  );
}
