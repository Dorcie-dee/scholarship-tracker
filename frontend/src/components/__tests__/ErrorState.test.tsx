import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorState } from '@/components/ErrorState';
import { ApiError } from '@/lib/api-client';

describe('ErrorState', () => {
  it('shows the server-authored message for an ApiError — never a raw stack trace or generic text', () => {
    const error = new ApiError(404, {
      statusCode: 404,
      message: 'Application not found',
      error: 'Not Found',
      path: '/applications/123',
      timestamp: new Date().toISOString(),
      requestId: 'req-1',
    });
    render(<ErrorState error={error} />);
    expect(screen.getByText('Application not found')).toBeInTheDocument();
  });

  it('falls back to a generic, safe message for a non-ApiError (e.g. a raw network TypeError)', () => {
    render(<ErrorState error={new TypeError('Failed to fetch')} />);
    expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument();
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
  });

  it('invokes onRetry when the Retry action is clicked', () => {
    let retried = false;
    render(<ErrorState error={new Error('x')} onRetry={() => { retried = true; }} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(retried).toBe(true);
  });
});
