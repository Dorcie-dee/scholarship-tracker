import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth-context';
import RegisterPage from '../page';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function renderRegisterPage() {
  return render(
    <AuthProvider>
      <RegisterPage />
    </AuthProvider>,
  );
}

describe('RegisterPage', () => {
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

  it('submits name/email/password to POST /api/auth/register and always lands on /verify-email (a brand-new account is never pre-verified)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 })); // bootstrap refresh
    renderRegisterPage();

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Ama Mensah' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'ama@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2hunter2' } });

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        accessToken: 'tok',
        accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        user: {
          id: '1',
          email: 'ama@example.com',
          name: 'Ama Mensah',
          isVerified: false,
          role: 'user',
          createdAt: new Date().toISOString(),
        },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /create your account/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/verify-email'));

    const registerCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/register');
    expect(registerCall).toBeTruthy();
    expect(JSON.parse(registerCall![1].body as string)).toEqual({
      name: 'Ama Mensah',
      email: 'ama@example.com',
      password: 'hunter2hunter2',
    });
  });

  it('omits the name field entirely from the request body when left blank, rather than sending an empty string', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    renderRegisterPage();

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'noname@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2hunter2' } });

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        accessToken: 'tok',
        accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        user: {
          id: '1',
          email: 'noname@example.com',
          name: null,
          isVerified: false,
          role: 'user',
          createdAt: new Date().toISOString(),
        },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /create your account/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/verify-email'));

    const registerCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/register');
    expect(JSON.parse(registerCall![1].body as string)).toEqual({
      email: 'noname@example.com',
      password: 'hunter2hunter2',
    });
  });

  it('shows the server\'s error message when the email is already taken, without navigating', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    renderRegisterPage();

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'taken@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2hunter2' } });

    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'An account with that email already exists' }, 409));
    fireEvent.click(screen.getByRole('button', { name: /create your account/i }));

    expect(await screen.findByText('An account with that email already exists')).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
