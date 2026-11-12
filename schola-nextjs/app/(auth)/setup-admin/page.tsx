'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth-context';
import { friendlyErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/form';
import { LockIcon } from '@/components/icons';

/**
 * One-time bootstrap screen for the platform's first administrator. There's
 * no "first user becomes admin" magic and no admin-creation control in the
 * regular UI — this page, gated by the `ADMIN_SETUP_SECRET` environment
 * value (see `.env.example`), is the only path to an admin account other
 * than direct database access. The backend (`setupAdmin()` in
 * `server/services/auth.service.ts`) also refuses outright once any admin
 * already exists, so this page naturally stops working after first use.
 */
export default function SetupAdminPage() {
  const { setupAdmin } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [setupSecret, setSetupSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await setupAdmin(name.trim() || undefined, email, password, setupSecret);
      router.push('/admin');
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <LockIcon size={18} aria-hidden="true" />
        </div>
        <h1 className="font-display text-page-title font-semibold text-ink">Set up the first admin</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          This creates the platform&rsquo;s only administrator account. It works once — before any admin exists
          — and needs the deployment&rsquo;s setup key.
        </p>
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
        <div>
          <Label htmlFor="setupSecret">Setup key</Label>
          <Input
            id="setupSecret"
            type="password"
            autoComplete="off"
            required
            value={setupSecret}
            onChange={(e) => setSetupSecret(e.target.value)}
            placeholder="From this deployment's ADMIN_SETUP_SECRET"
          />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={submitting} className="mt-1 w-full">
          {submitting ? 'Creating admin account…' : 'Create admin account'}
        </Button>
      </form>

      <p className="text-center text-xs text-ink-faint">
        Not setting up this deployment?{' '}
        <Link href="/login" className="font-semibold text-primary hover:text-primary-hover">
          Go to login
        </Link>
      </p>
    </div>
  );
}
