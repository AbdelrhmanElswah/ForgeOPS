import type { Repository } from '@forgeops/contracts';
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fakeApi, renderWithQuery } from '../../../test/utils';
import { RepositoryList } from './components/repository-list';
import { RepositorySettingsForm } from './components/repository-settings-form';
import { formatCommand, parseCommand, parseLines } from './model';

vi.mock('next/navigation', () => ({ useParams: () => ({}) }));

const repository = (n: number): Repository => ({
  id: `0192f0c4-7a3e-7c1d-9b2a-${String(n).padStart(12, '0')}`,
  githubRepoId: n,
  owner: 'acme',
  name: `repo-${String(n)}`,
  fullName: `acme/repo-${String(n)}`,
  defaultBranch: 'main',
  isPrivate: n % 2 === 0,
  settings: {
    testCommand: ['npm', 'test'],
    installCommand: ['npm', 'ci'],
    limits: { maxFilesChanged: 10, maxDiffLines: 400, testTimeoutSeconds: 300 },
    deniedPaths: [],
  },
  createdAt: '2026-10-20T10:00:00.000Z',
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('command text ↔ argument list', () => {
  it('splits on whitespace and joins back', () => {
    expect(parseCommand('  pnpm   test -- --coverage ')).toEqual({
      ok: true,
      args: ['pnpm', 'test', '--', '--coverage'],
    });
    expect(formatCommand(['pnpm', 'test'])).toBe('pnpm test');
    expect(formatCommand(null)).toBe('');
  });

  it('refuses quotes instead of guessing shell semantics', () => {
    expect(parseCommand('npm test -- "my file"')).toMatchObject({ ok: false });
    expect(parseCommand('   ')).toMatchObject({ ok: false });
  });

  it('reads one path per line', () => {
    expect(parseLines('src/legacy/**\n\n  docs/** \n')).toEqual(['src/legacy/**', 'docs/**']);
  });
});

describe('RepositoryList', () => {
  it('lists repositories and loads the next page with the cursor', async () => {
    const api = fakeApi({
      'GET /repositories': ({ url }) =>
        url.searchParams.get('cursor')
          ? { body: { items: [repository(3)], nextCursor: null } }
          : { body: { items: [repository(1), repository(2)], nextCursor: 'cursor-2' } },
    });
    renderWithQuery(<RepositoryList />);

    expect(await screen.findByRole('link', { name: 'acme/repo-1' })).toHaveAttribute(
      'href',
      `/repositories/${repository(1).id}`,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByRole('link', { name: 'acme/repo-3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    expect(api.calls.at(-1)?.path).toContain('cursor=cursor-2');
  });

  it('points to the GitHub integration when there is nothing yet', async () => {
    fakeApi({ 'GET /repositories': () => ({ body: { items: [], nextCursor: null } }) });
    renderWithQuery(<RepositoryList />);

    expect(await screen.findByRole('link', { name: 'Connect GitHub' })).toHaveAttribute(
      'href',
      '/settings/integrations',
    );
  });

  it('offers a retry with the trace id when loading fails', async () => {
    fakeApi({
      'GET /repositories': () => ({
        status: 500,
        body: {
          title: 'Internal Server Error',
          status: 500,
          code: 'internal_error',
          traceId: 'req-9',
        },
      }),
    });
    renderWithQuery(<RepositoryList />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Reference: req-9');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('RepositorySettingsForm', () => {
  const repo = repository(1);

  it('shows the current settings as editable text', () => {
    fakeApi({});
    renderWithQuery(<RepositorySettingsForm repository={repo} />);

    expect(screen.getByLabelText('Test command')).toHaveValue('npm test');
    expect(screen.getByLabelText('Max diff lines')).toHaveValue(400);
  });

  it('saves the settings as argument lists and limits', async () => {
    const api = fakeApi({
      [`PATCH /repositories/${repo.id}/settings`]: () => ({ body: repo }),
    });
    renderWithQuery(<RepositorySettingsForm repository={repo} />);

    const testCommand = screen.getByLabelText('Test command');
    await userEvent.clear(testCommand);
    await userEvent.type(testCommand, 'pnpm test -- --reporter=junit');
    await userEvent.clear(screen.getByLabelText('Install command'));
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();
    expect(api.calls[0]?.body).toEqual({
      testCommand: ['pnpm', 'test', '--', '--reporter=junit'],
      installCommand: null,
      limits: { maxFilesChanged: 10, maxDiffLines: 400, testTimeoutSeconds: 300 },
      deniedPaths: [],
    });
  });

  it('rejects a command the API would reject, without sending it', async () => {
    const api = fakeApi({});
    renderWithQuery(<RepositorySettingsForm repository={repo} />);

    const testCommand = screen.getByLabelText('Test command');
    await userEvent.clear(testCommand);
    await userEvent.type(testCommand, 'bash -c whoami');
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(screen.getByLabelText('Test command')).toHaveAccessibleDescription(
      /must start with one of: npm, pnpm, yarn, npx, node/,
    );
    expect(api.calls).toHaveLength(0);
  });

  it('shows out-of-range limits next to the field', async () => {
    fakeApi({});
    renderWithQuery(<RepositorySettingsForm repository={repo} />);

    const maxFiles = screen.getByLabelText('Max files changed');
    await userEvent.clear(maxFiles);
    await userEvent.type(maxFiles, '999');
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(screen.getByLabelText('Max files changed')).toHaveAttribute('aria-invalid', 'true');
  });
});
