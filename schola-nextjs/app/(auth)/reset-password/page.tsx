'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { apiFetch, friendlyErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/form';
import { CheckIcon } from '@/components/icons';

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('This reset link is missing its token. Request a new one.');
      return;
    }
    if (newPassword !== confirm) {
      setError("Those passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/auth/reset-password', { method: 'POST', body: { token, newPassword }, skipAuthRetry: true });
      setDone(true);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckIcon size={22} aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-display text-page-title font-semibold text-ink">Password reset</h1>
          <p className="mt-2 text-sm text-ink-soft">Your password has been changed. Log in with your new password.</p>
        </div>
        <Button onClick={() => router.push('/login')}>Go to login</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="font-display text-page-title font-semibold text-ink">Choose a new password</h1>
        <p className="mt-1.5 text-sm text-ink-soft">Make it something you haven&rsquo;t used here before.</p>
      </div>

      {!token && (
        <p className="rounded-lg bg-warning-soft px-3.5 py-2.5 text-sm font-medium text-warning">
          This link is missing a reset token — open it again from the email we sent you.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div>
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
        <div>
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat your new password"
          />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={submitting} className="mt-1 w-full">
          {submitting ? 'Resetting…' : 'Reset password'}
        </Button>
      </form>

      <p className="text-center text-sm text-ink-soft">
        <Link href="/login" className="font-semibold text-primary hover:text-primary-hover">
          Back to login
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
