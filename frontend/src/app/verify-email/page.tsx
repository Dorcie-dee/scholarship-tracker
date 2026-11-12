'use client';

import { App, Button, Form, Input, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useResendVerification, useVerifyEmail } from '@/lib/queries';
import { AuthShell } from '@/components/AuthShell';

const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmailPage() {
  const { user, status, refreshUser } = useAuth();
  const router = useRouter();
  const { message } = App.useApp();
  const verify = useVerifyEmail();
  const resend = useResendVerification();
  const [cooldown, setCooldown] = useState(0);
  const [form] = Form.useForm();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
    if (status === 'authenticated' && user?.isVerified) router.replace('/dashboard');
  }, [status, user, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (status !== 'authenticated' || !user || user.isVerified) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen mesh-light">
        <Spin size="large" />
      </div>
    );
  }

  const onSubmit = async (values: { code: string }) => {
    try {
      await verify.mutateAsync(values);
      await refreshUser();
      message.success('Email verified');
      router.replace('/dashboard');
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : 'Could not verify this code');
    }
  };

  const onResend = async () => {
    try {
      await resend.mutateAsync();
      message.success('A new code has been sent');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : 'Could not resend a code right now');
    }
  };

  return (
    <AuthShell
      title="Verify your email"
      subtitle={`We sent a 6-digit code to ${user.email}. Enter it below to verify your account.`}
    >
      <Form form={form} layout="vertical" onFinish={onSubmit} disabled={verify.isPending} requiredMark={false}>
        <Form.Item
          name="code"
          label="Verification code"
          rules={[{ required: true, len: 6, message: 'Enter the 6-digit code' }]}
        >
          <Input maxLength={6} autoFocus inputMode="numeric" size="large" placeholder="000000" className="!tracking-[0.3em] !text-center !text-lg" />
        </Form.Item>
        <Form.Item className="!mb-2 !mt-6">
          <Button type="primary" htmlType="submit" block size="large" loading={verify.isPending}>
            Verify
          </Button>
        </Form.Item>
      </Form>
      <Button type="link" block disabled={cooldown > 0 || resend.isPending} onClick={() => void onResend()}>
        {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
      </Button>
    </AuthShell>
  );
}
