import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import LoginPage from '../page';
import { ApiError } from '@/lib/api-client';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

const login = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ login, status: 'unauthenticated' }),
}));

function renderLogin() {
  return render(
    <AntApp>
      <LoginPage />
    </AntApp>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    login.mockReset();
    replace.mockReset();
  });

  it('requires both email and password before submitting — client-side validation matches server requirements without duplicating them', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(await screen.findByText('Enter your password')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('submits the entered credentials and navigates to the dashboard on success', async () => {
    login.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), 'demo@example.invalid');
    await user.type(screen.getByLabelText(/password/i), 'a reasonable passphrase');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => expect(login).toHaveBeenCalledWith('demo@example.invalid', 'a reasonable passphrase'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
  });

  it('shows a specific "incorrect email or password" message for a 401 — never a generic failure banner', async () => {
    login.mockRejectedValueOnce(
      new ApiError(401, {
        statusCode: 401,
        message: 'Invalid credentials',
        error: 'Unauthorized',
        path: '/auth/login',
        timestamp: new Date().toISOString(),
        requestId: null,
      }),
    );
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), 'demo@example.invalid');
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalledWith('/dashboard');
  });

  it('shows a rate-limit-specific message for a 429, distinct from an invalid-credentials message', async () => {
    login.mockRejectedValueOnce(
      new ApiError(429, {
        statusCode: 429,
        message: 'Too many requests',
        error: 'Too Many Requests',
        path: '/auth/login',
        timestamp: new Date().toISOString(),
        requestId: null,
      }),
    );
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), 'demo@example.invalid');
    await user.type(screen.getByLabelText(/password/i), 'whatever-password');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
  });
});
