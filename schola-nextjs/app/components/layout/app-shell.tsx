'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Sidebar } from './sidebar';
import { AlertCircleIcon } from '@/components/icons';

function VerifyBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-2.5 text-center text-sm font-medium text-warning">
      <AlertCircleIcon size={16} className="flex-none" aria-hidden="true" />
      <span>Verify your email to keep full access to your account.</span>
      <Link href="/verify-email" className="font-semibold underline underline-offset-2 hover:no-underline">
        Verify now
      </Link>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary"
          role="status"
          aria-label="Loading"
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper lg:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {user && !user.isVerified && <VerifyBanner />}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
