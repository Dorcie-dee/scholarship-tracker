import { AsyncLocalStorage } from 'async_hooks';

/**
 * Production hardening (Batch 10) — carries the current request's
 * correlation id through async call chains without threading it as an
 * explicit parameter through every service/method signature in the
 * codebase (which would touch dozens of files for no functional benefit).
 * Node's built-in `AsyncLocalStorage` — no new dependency — makes the id
 * available to anything running "inside" the request (every `await` chain
 * started from the middleware below), including code that has no direct
 * reference to the current `Request` object at all, like a service deep in
 * the call stack.
 */
interface RequestContextStore {
  requestId: string;
}

export const requestContextStorage =
  new AsyncLocalStorage<RequestContextStore>();

/** Returns the current request's correlation id, or `undefined` outside any request (e.g. a cron job — see auth-cleanup.service.ts). */
export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}
