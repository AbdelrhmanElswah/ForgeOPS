import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeApi, renderWithQuery } from '../../../test/utils';
import { IntegrationsPanel } from './components/integrations-panel';
import { connectResultMessage } from './model';

let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({ useSearchParams: () => searchParams }));

const installation = {
  id: '0192f0c4-7a3e-7c1d-9b2a-000000000001',
  installationId: 42,
  accountLogin: 'acme',
  accountType: 'Organization',
  suspended: true,
  repositoryCount: 3,
  createdAt: '2026-10-20T10:00:00.000Z',
};

describe('connectResultMessage', () => {
  it.each(['forbidden', 'conflict', 'missing_state', 'service_unavailable'])(
    'explains the "%s" failure in its own words',
    (reason) => {
      const message = connectResultMessage('error', reason);
      expect(message?.tone).toBe('danger');
      expect(message?.title).not.toBe(connectResultMessage('error', 'unheard-of')?.title);
    },
  );

  it('falls back to a generic message for an unknown reason, and to nothing without a result', () => {
    expect(connectResultMessage('error', 'unheard-of')?.title).toBe('Could not connect GitHub');
    expect(connectResultMessage(null, null)).toBeNull();
    expect(connectResultMessage('connected', null)?.tone).toBe('success');
  });
});

describe('IntegrationsPanel', () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists installations with their repository count and suspension state', async () => {
    fakeApi({ 'GET /github/installations': () => ({ body: { items: [installation] } }) });
    renderWithQuery(<IntegrationsPanel />);

    expect(await screen.findByText('acme')).toBeInTheDocument();
    expect(screen.getByText('3 repositories')).toBeInTheDocument();
    expect(screen.getByText('Suspended')).toBeInTheDocument();
  });

  it('shows the outcome GitHub redirected back with', async () => {
    searchParams = new URLSearchParams({ github: 'error', reason: 'forbidden' });
    fakeApi({ 'GET /github/installations': () => ({ body: { items: [] } }) });
    renderWithQuery(<IntegrationsPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent('GitHub refused the connection');
  });

  it('fetches a fresh single-use install link and leaves for GitHub', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { assign }); // jsdom can't navigate; record where we'd go
    fakeApi({
      'GET /github/installations': () => ({ body: { items: [] } }),
      'GET /github/install-url': () => ({
        body: { url: 'https://github.com/apps/forgeops/installations/new?state=abc' },
      }),
    });
    renderWithQuery(<IntegrationsPanel />);

    await userEvent.click(await screen.findByRole('button', { name: 'Install GitHub App' }));

    await vi.waitFor(() => {
      expect(assign).toHaveBeenCalledWith(
        'https://github.com/apps/forgeops/installations/new?state=abc',
      );
    });
  });
});
