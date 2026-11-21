import {
  IDEMPOTENCY_KEY_HEADER,
  type Repository,
  TASK_STATUSES,
  type Task,
  type TaskStatus,
} from '@forgeops/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fakeApi, renderWithQuery } from '../../../test/utils';
import { NewTaskForm } from './components/new-task-form';
import { TaskList } from './components/task-list';
import { TaskStats } from './components/task-stats';
import { canCancel, statusLabel, statusTone } from './model';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const id = (n: number) => `0192f0c4-7a3e-7c1d-9b2a-${String(n).padStart(12, '0')}`;

const task = (n: number, overrides: Partial<Task> = {}): Task => ({
  id: id(n),
  repositoryId: id(100),
  instruction: `Fix bug number ${String(n)} in checkout`,
  baseBranch: 'main',
  baseCommitSha: null,
  status: 'queued',
  failureReason: null,
  costUsd: 0,
  cancelRequestedAt: null,
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
  ...overrides,
});

const repository = (n: number): Repository => ({
  id: id(n),
  githubRepoId: n,
  owner: 'acme',
  name: `repo-${String(n)}`,
  fullName: `acme/repo-${String(n)}`,
  defaultBranch: 'main',
  isPrivate: false,
  settings: {
    testCommand: ['npm', 'test'],
    installCommand: null,
    limits: { maxFilesChanged: 10, maxDiffLines: 400, testTimeoutSeconds: 300 },
    deniedPaths: [],
  },
  createdAt: '2026-10-20T10:00:00.000Z',
});

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

describe('task model', () => {
  it('gives every status a tone and a readable label', () => {
    expect(statusTone('awaiting_approval')).toBe('warning');
    expect(statusTone('failed')).toBe('danger');
    expect(statusLabel('awaiting_approval')).toBe('Awaiting approval');
  });

  it('offers cancel only while the task can still be stopped', () => {
    expect(canCancel(task(1))).toBe(true);
    expect(canCancel(task(1, { status: 'completed' }))).toBe(false);
    expect(canCancel(task(1, { cancelRequestedAt: '2026-11-20T10:01:00.000Z' }))).toBe(false);
  });
});

describe('TaskList', () => {
  it('lists tasks with their status and cancels one', async () => {
    const api = fakeApi({
      'GET /tasks': () => ({
        body: { items: [task(1), task(2, { status: 'completed' })], nextCursor: null },
      }),
      [`POST /tasks/${id(1)}/cancel`]: () => ({ body: task(1, { status: 'cancelled' }) }),
    });
    renderWithQuery(<TaskList />);

    const list = await screen.findByRole('list', { name: 'Tasks' });
    expect(within(list).getByText('Queued')).toBeInTheDocument();
    expect(within(list).getByText('Completed')).toBeInTheDocument();
    // Only the unfinished task can be cancelled.
    expect(screen.getAllByRole('button', { name: /^Cancel task/ })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: /^Cancel task/ }));
    await waitFor(() => {
      expect(api.calls.some((c) => c.method === 'POST')).toBe(true);
    });
  });

  it('points to the new task form when there are none', async () => {
    fakeApi({ 'GET /tasks': () => ({ body: { items: [], nextCursor: null } }) });
    renderWithQuery(<TaskList />);

    expect(await screen.findByRole('link', { name: 'New task' })).toHaveAttribute(
      'href',
      '/tasks/new',
    );
  });
});

describe('TaskStats', () => {
  it('groups status counts into what needs you, running, and outcomes', async () => {
    const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<
      TaskStatus,
      number
    >;
    Object.assign(byStatus, { queued: 1, planning: 2, awaiting_approval: 3, failed: 4 });
    fakeApi({ 'GET /tasks/stats': () => ({ body: { byStatus } }) });
    renderWithQuery(<TaskStats />);

    expect(await screen.findByRole('region', { name: 'In progress' })).toHaveTextContent('3');
    expect(screen.getByRole('region', { name: 'Needs your approval' })).toHaveTextContent('3');
    expect(screen.getByRole('region', { name: 'Failed' })).toHaveTextContent('4');
    expect(screen.getByRole('region', { name: 'Completed' })).toHaveTextContent('0');
  });
});

describe('NewTaskForm', () => {
  const repo = repository(100);
  const routes = {
    'GET /repositories': () => ({ body: { items: [repo], nextCursor: null } }),
    [`GET /repositories/${repo.id}/branches`]: () => ({
      body: {
        items: [
          { name: 'main', commitSha: 'a'.repeat(40), isProtected: true },
          { name: 'develop', commitSha: 'b'.repeat(40), isProtected: false },
        ],
      },
    }),
  };

  it('creates a task on the chosen branch with an idempotency key, then opens the list', async () => {
    let key: string | null = null;
    const api = fakeApi({
      ...routes,
      'POST /tasks': ({ init }) => {
        key = new Headers(init.headers).get(IDEMPOTENCY_KEY_HEADER);
        return { status: 202, body: { id: id(1), status: 'queued' } };
      },
    });
    renderWithQuery(<NewTaskForm />);

    await screen.findByRole('option', { name: 'develop' });
    await userEvent.selectOptions(screen.getByLabelText('Base branch'), 'develop');
    await userEvent.type(
      screen.getByLabelText('What should the agents do?'),
      'Checkout returns 500 for empty carts',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/tasks');
    });
    expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({
      repositoryId: repo.id,
      instruction: 'Checkout returns 500 for empty carts',
      baseBranch: 'develop',
    });
    expect(key).toBeTruthy();
  });

  it('refuses a too-short instruction without sending it', async () => {
    const api = fakeApi(routes);
    renderWithQuery(<NewTaskForm />);

    await userEvent.type(await screen.findByLabelText('What should the agents do?'), 'fix');
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }));

    expect(screen.getByLabelText('What should the agents do?')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('asks to connect GitHub when there is no repository', async () => {
    fakeApi({ 'GET /repositories': () => ({ body: { items: [], nextCursor: null } }) });
    renderWithQuery(<NewTaskForm />);

    expect(await screen.findByRole('link', { name: 'Connect GitHub' })).toBeInTheDocument();
  });
});
