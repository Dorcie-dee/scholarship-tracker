'use client';

import Link from 'next/link';
import { Button } from 'antd';

export function VerifyEmailBanner() {
  return (
    <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3.5 animate-fade">
      <div>
        <p className="m-0 text-sm font-semibold text-amber-950">Your email isn&apos;t verified yet</p>
        <p className="mt-0.5 mb-0 text-sm text-amber-900/75">
          Verifying confirms this address is really yours.
        </p>
      </div>
      <Link href="/verify-email">
        <Button size="middle" className="!border-amber-300 !bg-white !text-amber-950 hover:!border-amber-400">
          Verify now
        </Button>
      </Link>
    </div>
  );
}
