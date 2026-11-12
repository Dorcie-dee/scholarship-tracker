'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, friendlyErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/form';
import { MailIcon } from '@/components/icons';

const RESEND_COOLDOWN_SECONDS = 30;

export default function VerifyEmailPage() {
  const { status, user, setUser } = useAuth();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
    if (status === 'authenticated' && user?.isVerified) router.replace('/dashboard');
  }, [status, user, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/auth/verify-email', { method: 'POST', body: { code } });
      if (user) setUser({ ...user, isVerified: true });
      router.push('/dashboard');
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    setResendState('sending');
    try {
      await apiFetch('/auth/resend-verification', { method: 'POST' });
      setResendState('sent');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(friendlyErrorMessage(err));
      setResendState('idle');
    }
  }

  if (status !== 'authenticated') return null;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <MailIcon size={22} aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-display text-page-title font-semibold text-ink">Verify your email</h1>
          <p className="mt-2 text-sm text-ink-soft">
            We sent a 6-digit code to <span className="font-semibold text-ink">{user?.email}</span>.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div>
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            className="text-center text-lg font-semibold tracking-[0.5em]"
          />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={submitting || code.length !== 6} className="w-full">
          {submitting ? 'Verifying…' : 'Verify account'}
        </Button>
      </form>

      <div className="text-center text-sm text-ink-soft">
        Didn&rsquo;t get a code?{' '}
        <button
          type="button"
          onClick={handleResend}
          disabled={resendState === 'sending' || cooldown > 0}
          className="font-semibold text-primary hover:text-primary-hover disabled:cursor-not-allowed disabled:text-ink-faint disabled:hover:text-ink-faint"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : resendState === 'sending' ? 'Sending…' : 'Resend code'}
        </button>
      </div>

      <p className="text-center text-sm">
        <Link href="/login" className="font-semibold text-ink-faint hover:text-ink-soft">
          Sign out and come back later
        </Link>
      </p>
    </div>
  );
}
