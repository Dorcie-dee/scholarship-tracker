import { ApiError } from '@/lib/api-client';

/**
 * Turn API failures into calm, non-technical copy for users.
 * Prefer a specific fallback when the caller knows the action context.
 */
export function friendlyApiMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  if (error.status === 401) return 'Please log in again to continue.';
  if (error.status === 403) return 'You don’t have permission to do that.';
  if (error.status === 404) return 'We couldn’t find that item. It may have been removed.';
  if (error.status === 409) {
    return soften(error.message) || 'That conflicts with something already saved. Check and try again.';
  }
  if (error.status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (error.status >= 500) return 'Something went wrong on our side. Please try again shortly.';

  return soften(error.message) || fallback;
}

function soften(message: string): string {
  const trimmed = message?.trim();
  if (!trimmed) return '';

  // Drop common Nest/class-validator noise while keeping the useful part.
  const cleaned = trimmed
    .replace(/^Bad Request Exception:?\s*/i, '')
    .replace(/^Internal Server Error:?\s*/i, '')
    .replace(/uuid/gi, 'id')
    .replace(/\bFK\b/g, 'link')
    .replace(/\bnull\b/gi, 'empty');

  // If it still looks like a stack / code dump, hide it.
  if (/at\s+\w+\s+\(|Exception:|ECONNREFUSED|TypeORM|QueryFailedError/i.test(cleaned)) {
    return '';
  }

  return cleaned;
}
