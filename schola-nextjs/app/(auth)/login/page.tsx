'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth-context';
import { friendlyErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/form';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email, password);
      router.push(user?.isVerified === false ? '/verify-email' : '/dashboard');
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Welcome back</h1>
        <p className="mt-1.5 text-sm text-ink-soft">Log in to pick up right where you left off.</p>
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
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="mb-1.5 text-xs font-semibold text-primary hover:text-primary-hover">
              Forgot your password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={submitting} className="mt-1 w-full">
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>

      <p className="text-center text-sm text-ink-soft">
        New to Schola?{' '}
        <Link href="/register" className="font-semibold text-primary hover:text-primary-hover">
          Create an account
        </Link>
      </p>
    </div>
  );
}
