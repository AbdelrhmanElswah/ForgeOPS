import {
  IDEMPOTENCY_KEY_HEADER,
  type Repository,
  TASK_STATUSES,
  type Task,
  type TaskStatus,
} from '@forgeops/contracts';
import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeApi, renderWithQuery } from '../../../test/utils';
import { NewTaskForm } from './components/new-task-form';
import { TaskDetail } from './components/task-detail';
import { TaskList } from './components/task-list';
import { TaskStats } from './components/task-stats';
import { canCancel, describeEvent, statusLabel, statusTone } from './model';

const id = (n: number) => `0192f0c4-7a3e-7c1d-9b2a-${String(n).padStart(12, '0')}`;

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: '0192f0c4-7a3e-7c1d-9b2a-000000000001' }),
}));

/** Stand-in for the browser's EventSource (jsdom has none): tests push events and errors. */
class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = FakeEventSource.OPEN;
  onmessage: ((message: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(
    readonly url: string,
    readonly init?: EventSourceInit,
  ) {
    FakeEventSource.instances.push(this);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }

  emit(event: object) {
    act(() => {
      this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(event) }));
    });
  }

  fail(readyState: number) {
    this.readyState = readyState;
    act(() => {
      this.onerror?.();
    });
  }
}

const lastSource = () => {
  const source = FakeEventSource.instances.at(-1);
  if (!source) throw new Error('no EventSource was opened');
  return source;
};

beforeEach(() => {
  FakeEventSource.instances = [];
});

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

describe('describeEvent', () => {
  const base = { seq: 1, taskId: id(1), createdAt: '2026-11-20T10:00:00.000Z' };

  it('turns each event type into one readable line', () => {
    expect(
      describeEvent({
        ...base,
        type: 'status.changed',
        status: 'failed',
        failureReason: 'tests_failed',
      }),
    ).toEqual({ title: 'Status: Failed', detail: 'Tests failed', tone: 'danger' });
    expect(
      describeEvent({ ...base, type: 'node.completed', node: 'planner', durationMs: 1500 }),
    ).toEqual({ title: 'Planner finished', detail: '1.5 s', tone: 'neutral' });
    expect(
      describeEvent({
        ...base,
        type: 'tool.called',
        role: 'investigator',
        tool: 'search',
        ok: false,
        durationMs: 200,
        error: 'path denied',
      }),
    ).toEqual({ title: 'Investigator used search', detail: '0.2 s · path denied', tone: 'danger' });
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

describe('TaskDetail (live timeline)', () => {
  const event = (seq: number, extra: object) => ({
    seq,
    taskId: id(1),
    createdAt: '2026-11-20T10:00:00.000Z',
    ...extra,
  });

  function serveTask(...states: Partial<Task>[]) {
    let call = 0;
    return fakeApi({
      [`GET /tasks/${id(1)}`]: () => ({
        body: task(1, states[Math.min(call++, states.length - 1)]),
      }),
    });
  }

  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  it('streams events into the timeline and stops once the task is finished', async () => {
    const api = serveTask({ status: 'planning' }, { status: 'completed' });
    renderWithQuery(<TaskDetail />);

    expect(await screen.findByRole('heading', { name: task(1).instruction })).toBeInTheDocument();
    const source = lastSource();
    expect(source.url).toContain(`/api/v1/tasks/${id(1)}/events?after=0`);
    expect(source.init).toEqual({ withCredentials: true });

    source.emit(event(1, { type: 'node.started', node: 'planner' }));
    source.emit(event(1, { type: 'node.started', node: 'planner' })); // duplicate: ignored
    source.emit(event(2, { type: 'status.changed', status: 'completed', failureReason: null }));

    const timeline = await screen.findByRole('list', { name: 'Timeline' });
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(2);
    expect(within(timeline).getByText('Planner started')).toBeInTheDocument();
    expect(source.readyState).toBe(FakeEventSource.CLOSED);
    // The final status refetches the task, so the header follows without polling.
    await waitFor(() => {
      expect(api.calls.filter((c) => c.path === `/tasks/${id(1)}`)).toHaveLength(2);
    });
    expect(await screen.findByText('Completed')).toBeInTheDocument();
  });

  it('stops the browser reconnecting when the server ends a finished task stream', async () => {
    serveTask({ status: 'investigating' }, { status: 'failed', failureReason: 'internal_error' });
    renderWithQuery(<TaskDetail />);
    await screen.findByRole('heading', { name: task(1).instruction });

    // Stream ended without a final event (its write failed): EventSource would retry forever.
    lastSource().fail(FakeEventSource.CONNECTING);

    await waitFor(() => {
      expect(lastSource().readyState).toBe(FakeEventSource.CLOSED);
    });
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('reopens a refused stream (e.g. expired session) after refreshing, resuming after the last event', async () => {
    serveTask({ status: 'planning' });
    renderWithQuery(<TaskDetail />);
    await screen.findByRole('heading', { name: task(1).instruction });

    lastSource().emit(event(1, { type: 'node.started', node: 'planner' }));
    lastSource().fail(FakeEventSource.CLOSED);

    await waitFor(
      () => {
        expect(FakeEventSource.instances).toHaveLength(2);
      },
      { timeout: 5000 },
    );
    expect(lastSource().url).toContain('after=1');
  });

  it('keeps showing the task when a background refresh fails', async () => {
    let call = 0;
    fakeApi({
      [`GET /tasks/${id(1)}`]: () =>
        call++ === 0
          ? { body: task(1, { status: 'planning' }) }
          : {
              status: 503,
              body: { title: 'Service Unavailable', status: 503, code: 'unavailable' },
            },
    });
    renderWithQuery(<TaskDetail />);
    await screen.findByRole('heading', { name: task(1).instruction });

    lastSource().emit(
      event(1, { type: 'status.changed', status: 'investigating', failureReason: null }),
    );

    expect(await screen.findByText(/could not be refreshed/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: task(1).instruction })).toBeInTheDocument();
    expect(screen.getByText('Status: Investigating')).toBeInTheDocument();
  });

  it('says so when the task does not exist (or is not yours)', async () => {
    fakeApi({});
    renderWithQuery(<TaskDetail />);

    expect(await screen.findByText('Task not found')).toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});
