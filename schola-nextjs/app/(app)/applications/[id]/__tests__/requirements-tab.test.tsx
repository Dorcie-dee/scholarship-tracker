import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RequirementsTab } from '../requirements-tab';
import type { Requirement } from '../types';

/**
 * Covers the product's standout feature — the AI-suggestion lifecycle
 * (request / confirm / reject) — end to end through the real component, not
 * just the service layer (already covered by the backend's own test suite).
 * `RequirementsTab` receives its data as props rather than fetching it
 * itself, so no network mocking is needed for the read side — only the
 * mutation endpoints this component actually calls.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function baseRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: 'req-1',
    requirementType: 'document',
    description: 'Upload your transcript',
    status: 'unknown',
    opportunityId: null,
    applicationId: 'app-1',
    copiedFromRequirementId: null,
    notes: null,
    suggestedStatus: null,
    suggestedAt: null,
    suggestionRationale: null,
    suggestionSource: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderTab(requirements: Requirement[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RequirementsTab applicationId="app-1" requirements={requirements} isLoading={false} isError={false} error={null} />
    </QueryClientProvider>,
  );
}

describe('RequirementsTab — AI-suggestion lifecycle', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('a requirement with no pending suggestion shows "Get an AI suggestion", which POSTs to /requirements/:id/ai-suggestion', async () => {
    renderTab([baseRequirement()]);

    expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument();
    const suggestButton = screen.getByRole('button', { name: /get an ai suggestion/i });

    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    fireEvent.click(suggestButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements/req-1/ai-suggestion',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('does not offer an AI suggestion for a requirement already in an authoritative state (confirmed)', () => {
    renderTab([baseRequirement({ status: 'confirmed' })]);
    expect(screen.queryByRole('button', { name: /get an ai suggestion/i })).not.toBeInTheDocument();
  });

  it('a pending suggestion shows its rationale and Confirm/Dismiss, which POST to the confirm/reject endpoints', async () => {
    renderTab([
      baseRequirement({
        status: 'ai_assessment',
        suggestedStatus: 'confirmed',
        suggestionRationale: 'A matching document was uploaded recently.',
        suggestedAt: new Date().toISOString(),
      }),
    ]);

    expect(screen.getByText(/A matching document was uploaded recently\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /get an ai suggestion/i })).not.toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements/req-1/ai-suggestion/confirm',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('Dismiss POSTs to the reject endpoint', async () => {
    renderTab([
      baseRequirement({
        status: 'ai_assessment',
        suggestedStatus: 'not_met',
        suggestionRationale: 'No matching document found.',
        suggestedAt: new Date().toISOString(),
      }),
    ]);

    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements/req-1/ai-suggestion/reject',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('shows a friendly error message if requesting a suggestion fails, without crashing', async () => {
    renderTab([baseRequirement()]);

    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'AI suggestion failed; your requirement status was not changed' }, 503));
    fireEvent.click(screen.getByRole('button', { name: /get an ai suggestion/i }));

    expect(await screen.findByText('AI suggestion failed; your requirement status was not changed')).toBeInTheDocument();
  });
});
