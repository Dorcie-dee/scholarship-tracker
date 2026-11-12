'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { apiFetch, friendlyErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/form';
import { MailIcon } from '@/components/icons';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/auth/forgot-password', { method: 'POST', body: { email }, skipAuthRetry: true });
      setSent(true);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <MailIcon size={22} aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-display text-page-title font-semibold text-ink">Check your email</h1>
          <p className="mt-2 text-sm text-ink-soft">
            If an account exists for <span className="font-semibold text-ink">{email}</span>, we&rsquo;ve sent
            instructions to reset your password.
          </p>
        </div>
        <Link href="/login" className="text-sm font-semibold text-primary hover:text-primary-hover">
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="font-display text-page-title font-semibold text-ink">Reset your password</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          Enter the email on your account and we&rsquo;ll send you a link to reset it.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div>
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={submitting} className="mt-1 w-full">
          {submitting ? 'Sending…' : 'Send reset instructions'}
        </Button>
      </form>

      <p className="text-center text-sm text-ink-soft">
        Remembered it after all?{' '}
        <Link href="/login" className="font-semibold text-primary hover:text-primary-hover">
          Log in
        </Link>
      </p>
    </div>
  );
}
