import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeApi, renderWithQuery } from '../../../../test/utils';
import { AuthForm } from './auth-form';

const replace = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));

const user = {
  id: '0192f0c4-7a3e-7c1d-9b2a-5e6f7a8b9c0d',
  email: 'dev@example.com',
  displayName: 'Dev',
  createdAt: '2026-10-20T10:00:00.000Z',
};

function renderForm(mode: 'login' | 'register') {
  renderWithQuery(<AuthForm mode={mode} />);
}

/** Both auth endpoints answer the same way in these tests. */
function respondWith(status: number, body: unknown) {
  const handler = () => ({ status, body });
  return fakeApi({ 'POST /auth/login': handler, 'POST /auth/register': handler });
}

describe('AuthForm', () => {
  beforeEach(() => {
    replace.mockReset();
    searchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates with the same rules as the API before sending anything', async () => {
    const api = respondWith(200, { user });
    renderForm('register');

    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Invalid email address');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(api.calls).toHaveLength(0);
  });

  it('signs in and continues to the page the user came from', async () => {
    searchParams = new URLSearchParams({ next: '/tasks/42' });
    respondWith(200, { user });
    renderForm('login');

    await userEvent.type(screen.getByLabelText('Email'), 'dev@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await vi.waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/tasks/42');
    });
  });

  it('ignores an external ?next= (no open redirect)', async () => {
    searchParams = new URLSearchParams({ next: 'https://evil.example' });
    respondWith(200, { user });
    renderForm('login');

    await userEvent.type(screen.getByLabelText('Email'), 'dev@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await vi.waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('shows the server’s message when sign-in fails', async () => {
    respondWith(401, {
      title: 'Unauthorized',
      status: 401,
      code: 'unauthenticated',
      detail: 'Invalid email or password.',
    });
    renderForm('login');

    await userEvent.type(screen.getByLabelText('Email'), 'dev@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(replace).not.toHaveBeenCalled();
  });

  it('puts server-side field errors next to the right field', async () => {
    respondWith(409, {
      title: 'Bad Request',
      status: 400,
      code: 'validation_failed',
      errors: [{ path: 'email', message: 'An account with this email already exists.' }],
    });
    renderForm('register');

    await userEvent.type(screen.getByLabelText('Email'), 'dev@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await vi.waitFor(() => {
      expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
        'An account with this email already exists.',
      );
    });
  });
});
