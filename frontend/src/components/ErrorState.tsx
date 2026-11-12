'use client';

import { Button } from 'antd';
import { ApiError } from '@/lib/api-client';

export function ErrorState({
  error,
  onRetry,
  title = 'Something went wrong',
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const description =
    error instanceof ApiError
      ? error.message
      : 'This could not be loaded. Please try again.';

  return (
    <div className="surface border-[color:var(--danger)]/20 bg-red-50/40 px-5 py-5 animate-fade">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h3 className="m-0 text-sm font-semibold text-[color:var(--danger)]">{title}</h3>
          <p className="mt-1 mb-0 text-sm text-[color:var(--text-secondary)]">{description}</p>
        </div>
        {onRetry && (
          <Button danger onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
