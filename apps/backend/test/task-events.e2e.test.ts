import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import {
  AUTH_COOKIES,
  CreateTaskResponseSchema,
  IDEMPOTENCY_KEY_HEADER,
  RepositoryPageSchema,
  type TaskEvent,
  TaskEventSchema,
} from '@forgeops/contracts';
import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TaskEventsService } from '../src/modules/events/application/task-events.service.js';
import { TaskLifecycleService } from '../src/modules/tasks/application/task-lifecycle.service.js';
import { createTestApp } from './utils/create-test-app.js';
import { type Agent, connectInstallation, signUp } from './utils/test-users.js';

/** Parses an SSE body into its data events (heartbeats have no `id`, so they're skipped). */
function parseSse(body: string): TaskEvent[] {
  return body
    .split('\n\n')
    .filter((block) => block.includes('\nid: ') || block.startsWith('id: '))
    .map((block) => {
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice('data: '.length))
        .join('\n');
      return TaskEventSchema.parse(JSON.parse(data));
    });
}

describe('Task events over SSE (e2e)', () => {
  let app: INestApplication<Server>;
  let alice: Agent;
  let events: TaskEventsService;
  let lifecycle: TaskLifecycleService;
  let taskId: string;

  beforeEach(async () => {
    app = await createTestApp();
    events = app.get(TaskEventsService);
    lifecycle = app.get(TaskLifecycleService);
    alice = await signUp(app, 'alice@example.com');
    await connectInstallation(app, alice, {
      installationId: 1,
      login: 'alice',
      githubUserId: 101,
      repoIds: [11],
    });
    const repos: unknown = (await alice.get('/api/v1/repositories')).body;
    const repositoryId = RepositoryPageSchema.parse(repos).items[0]?.id ?? '';
    const created: unknown = (
      await alice
        .post('/api/v1/tasks')
        .set(IDEMPOTENCY_KEY_HEADER, 'events-test-key')
        .send({ repositoryId, instruction: 'Fix the checkout crash on empty carts.' })
        .expect(202)
    ).body;
    taskId = CreateTaskResponseSchema.parse(created).id;
  });

  afterEach(async () => {
    await app.close();
  });

  async function runToCompletion() {
    await lifecycle.transition(taskId, 'planning');
    await events.record(taskId, { type: 'node.started', node: 'planner' });
    await events.record(taskId, {
      type: 'llm.called',
      role: 'planner',
      model: 'claude-opus-5-5',
      inputTokens: 1000,
      outputTokens: 200,
      costUsd: 0.008,
    });
    await lifecycle.transition(taskId, 'failed', { failureReason: 'needs_human' });
  }

  it('replays the whole timeline of a finished task and closes the stream', async () => {
    await runToCompletion();

    const response = await alice.get(`/api/v1/tasks/${taskId}/events`).expect(200);

    expect(response.headers['content-type']).toMatch(/text\/event-stream/);
    expect(parseSse(response.text).map((e) => `${String(e.seq)}:${e.type}`)).toEqual([
      '1:status.changed',
      '2:node.started',
      '3:llm.called',
      '4:status.changed',
    ]);
  });

  it('resumes after Last-Event-ID, as a reconnecting browser does', async () => {
    await runToCompletion();

    const response = await alice
      .get(`/api/v1/tasks/${taskId}/events`)
      .set('Last-Event-ID', '2')
      .expect(200);

    expect(parseSse(response.text).map((e) => e.seq)).toEqual([3, 4]);
  });

  it('adds model cost to the task', async () => {
    await runToCompletion();

    const task: unknown = (await alice.get(`/api/v1/tasks/${taskId}`)).body;
    expect((task as { costUsd: number }).costUsd).toBeCloseTo(0.008, 10);
  });

  it("refuses another user's task with a normal 404, leaking none of its events", async () => {
    // The task must already have events: a stream opened without the ownership check would
    // replay them to the stranger before noticing anything was wrong.
    await events.record(taskId, { type: 'node.started', node: 'planner' });
    const bob = await signUp(app, 'bob@example.com');

    const response = await bob.get(`/api/v1/tasks/${taskId}/events`).expect(404);

    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(response.text).not.toContain('node.started');
  });

  it('streams events live while the task runs, then closes when it finishes', async () => {
    // A real HTTP connection, read chunk by chunk like a browser's EventSource.
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    const login = await alice.post('/api/v1/auth/login').send({
      email: 'alice@example.com',
      password: 'correct horse battery staple',
    });
    const cookie = (login.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith(`${AUTH_COOKIES.accessToken}=`))
      ?.split(';')[0];

    const response = await fetch(`http://127.0.0.1:${String(port)}/api/v1/tasks/${taskId}/events`, {
      headers: { cookie: cookie ?? '' },
    });
    const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader();
    if (!reader) throw new Error('no response body');
    const decoder = new TextDecoder();
    let text = '';
    const readUntil = async (predicate: () => boolean) => {
      while (!predicate()) {
        const { value, done } = await reader.read();
        if (done) return;
        text += decoder.decode(value);
      }
    };

    await events.record(taskId, { type: 'node.started', node: 'planner' });
    await readUntil(() => parseSse(text).length >= 1);
    expect(parseSse(text)[0]).toMatchObject({ seq: 1, type: 'node.started' });

    await lifecycle.transition(taskId, 'cancelled');
    await readUntil(() => false); // returns when the server ends the stream

    expect(parseSse(text).map((e) => e.type)).toEqual(['node.started', 'status.changed']);
  });
});
