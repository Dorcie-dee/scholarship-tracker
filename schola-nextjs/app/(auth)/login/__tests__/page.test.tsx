import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth-context';
import LoginPage from '../page';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function renderLoginPage() {
  return render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>,
  );
}

describe('LoginPage', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    pushMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('submits the entered email/password to POST /api/auth/login and navigates to /dashboard on success', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 })); // AuthProvider's silent bootstrap refresh
    renderLoginPage();

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'student@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2hunter2' } });

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        accessToken: 'tok',
        accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        user: {
          id: '1',
          email: 'student@example.com',
          name: null,
          isVerified: true,
          role: 'user',
          createdAt: new Date().toISOString(),
        },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard'));

    const loginCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/login');
    expect(loginCall).toBeTruthy();
    expect(loginCall![1].method).toBe('POST');
    expect(JSON.parse(loginCall![1].body as string)).toEqual({
      email: 'student@example.com',
      password: 'hunter2hunter2',
    });
  });

  it('routes an unverified user to /verify-email instead of /dashboard', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    renderLoginPage();

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2hunter2' } });

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        accessToken: 'tok',
        accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        user: {
          id: '1',
          email: 'new@example.com',
          name: null,
          isVerified: false,
          role: 'user',
          createdAt: new Date().toISOString(),
        },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/verify-email'));
  });

  it('shows the server\'s error message on invalid credentials, without navigating anywhere', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    renderLoginPage();

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'student@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });

    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Invalid email or password' }, 401));
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
