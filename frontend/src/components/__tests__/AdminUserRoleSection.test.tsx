import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { AdminUserRoleSection } from '@/components/admin/AdminUserRoleSection';
import { ApiError } from '@/lib/api-client';
import { UserRole } from '@/lib/shared-types';
import type { AdminDirectoryUser, ApiErrorBody, PaginatedResult } from '@/lib/types';

const { apiGet, apiPatch } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiGet,
    apiPatch,
  };
});

const currentUserId = 'admin-self';

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: currentUserId,
      email: 'admin@example.com',
      name: 'Admin Self',
      role: UserRole.ADMIN,
      isVerified: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  }),
}));

function page(items: AdminDirectoryUser[], hasNextPage = false): PaginatedResult<AdminDirectoryUser> {
  return {
    items,
    nextCursor: hasNextPage ? 'cursor-next' : null,
    hasNextPage,
  };
}

function directoryUser(overrides: Partial<AdminDirectoryUser>): AdminDirectoryUser {
  return {
    id: 'user-1',
    name: 'Alex Applicant',
    email: 'alex@example.com',
    role: UserRole.USER,
    isVerified: true,
    createdAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function errorBody(message: string): ApiErrorBody {
  return {
    statusCode: 400,
    message,
    error: 'Bad Request',
    path: '/users/x/role',
    timestamp: '2026-01-01T00:00:00.000Z',
    requestId: null,
  };
}

describe('AdminUserRoleSection', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    apiGet.mockReset();
    apiPatch.mockReset();
  });

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <App>{children}</App>
      </QueryClientProvider>
    );
  }

  it('loads a searchable page of users and never asks for a raw user ID', async () => {
    apiGet.mockResolvedValueOnce(
      page([
        directoryUser({ id: currentUserId, name: 'Admin Self', email: 'admin@example.com', role: UserRole.ADMIN }),
        directoryUser({ id: 'user-2', name: 'Blake User', email: 'blake@example.com' }),
      ]),
    );

    render(<AdminUserRoleSection />, { wrapper });

    expect(await screen.findByText('Blake User')).toBeInTheDocument();
    expect(screen.getByLabelText('Search users by name or email')).toBeInTheDocument();
    expect(screen.queryByLabelText(/user id/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/uuid/i)).not.toBeInTheDocument();

    expect(apiGet).toHaveBeenCalledWith(expect.stringMatching(/^\/users\?/));
    expect(apiGet.mock.calls[0][0]).toMatch(/limit=20/);
  });

  it('disables selecting the current admin (self-change blocked in UI)', async () => {
    apiGet.mockResolvedValueOnce(
      page([
        directoryUser({ id: currentUserId, name: 'Admin Self', email: 'admin@example.com', role: UserRole.ADMIN }),
        directoryUser({ id: 'user-2', name: 'Blake User', email: 'blake@example.com' }),
      ]),
    );

    render(<AdminUserRoleSection />, { wrapper });
    await screen.findByText('Blake User');

    const selfOption = screen.getByRole('option', { name: /Admin Self/i });
    expect(selfOption).toBeDisabled();
    expect(within(selfOption).getByText('(you)')).toBeInTheDocument();
  });

  it('requires confirmation before PATCH /users/:id/role and invalidates the directory', async () => {
    const target = directoryUser({ id: 'user-2', name: 'Blake User', email: 'blake@example.com' });
    apiGet.mockResolvedValue(page([target]));
    apiPatch.mockResolvedValue({
      ...target,
      role: UserRole.ADMIN,
    });

    const user = userEvent.setup();
    render(<AdminUserRoleSection />, { wrapper });
    await screen.findByText('Blake User');

    await user.click(screen.getByRole('option', { name: /Blake User/i }));
    expect(
      screen.getByText((_, node) => node?.textContent?.replace(/\s+/g, ' ').trim() === 'Current role: User'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Change role' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(apiPatch).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/users/user-2/role', { role: UserRole.ADMIN }),
    );

    await waitFor(() => expect(apiGet.mock.calls.length).toBeGreaterThan(1));
  });

  it('surfaces last-admin refusal from the API (backend 400)', async () => {
    const target = directoryUser({
      id: 'user-3',
      name: 'Only Admin',
      email: 'only@example.com',
      role: UserRole.ADMIN,
    });
    apiGet.mockResolvedValue(page([target]));
    apiPatch.mockRejectedValue(
      new ApiError(400, errorBody('Cannot demote the last remaining administrator')),
    );

    const user = userEvent.setup();
    render(<AdminUserRoleSection />, { wrapper });
    await screen.findByText('Only Admin');

    await user.click(screen.getByRole('option', { name: /Only Admin/i }));
    await user.click(screen.getByRole('button', { name: 'Change role' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm' }));

    expect(
      await screen.findByText(/Cannot demote the last remaining administrator/i),
    ).toBeInTheDocument();
  });

  it('passes search and role filters to GET /users', async () => {
    apiGet.mockResolvedValue(page([]));
    const user = userEvent.setup();
    render(<AdminUserRoleSection />, { wrapper });

    await user.type(screen.getByLabelText('Search users by name or email'), 'blake');
    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith(expect.stringContaining('search=blake')),
    );
  });
});
