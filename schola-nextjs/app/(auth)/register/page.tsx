'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth-context';
import { friendlyErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/form';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(name.trim() || undefined, email, password);
      router.push('/verify-email');
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Start tracking today</h1>
        <p className="mt-1.5 text-sm text-ink-soft">Takes under a minute. No credit card, ever.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div>
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ama Mensah"
          />
        </div>
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
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={submitting} className="mt-1 w-full">
          {submitting ? 'Creating your account…' : 'Create your account'}
        </Button>
      </form>

      <p className="text-center text-xs text-ink-faint">
        By continuing, you agree to Schola&rsquo;s Terms of Service and Privacy Policy.
      </p>

      <p className="text-center text-sm text-ink-soft">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-primary hover:text-primary-hover">
          Log in
        </Link>
      </p>
    </div>
  );
}
