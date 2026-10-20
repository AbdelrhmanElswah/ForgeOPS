import type { Server } from 'node:http';

import {
  CreateTaskResponseSchema,
  IDEMPOTENCY_KEY_HEADER,
  ProblemDetailsSchema,
  RepositoryPageSchema,
  TaskPageSchema,
  TaskSchema,
} from '@forgeops/contracts';
import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TaskQueue } from '../src/infrastructure/queue/task-queue.js';
import { TasksRepository } from '../src/modules/tasks/application/tasks.repository.js';
import type { InMemoryTaskQueue } from './fakes/in-memory-task-queue.js';
import type { InMemoryTasksRepository } from './fakes/in-memory-tasks.repository.js';
import { createTestApp } from './utils/create-test-app.js';
import { type Agent, connectInstallation, signUp } from './utils/test-users.js';

describe('Tasks (e2e)', () => {
  let app: INestApplication<Server>;
  let alice: Agent;
  let bob: Agent;
  let queue: InMemoryTaskQueue;
  let tasks: InMemoryTasksRepository;
  let aliceRepoId: string;
  let keyCounter = 0;

  const newKey = () => `test-key-${String(++keyCounter).padStart(4, '0')}`;
  const instruction = 'Find why checkout returns 500 for empty carts and fix it.';

  beforeEach(async () => {
    app = await createTestApp();
    queue = app.get<InMemoryTaskQueue>(TaskQueue);
    tasks = app.get<InMemoryTasksRepository>(TasksRepository);
    alice = await signUp(app, 'alice@example.com');
    bob = await signUp(app, 'bob@example.com');
    await connectInstallation(app, alice, {
      installationId: 1,
      login: 'alice',
      githubUserId: 101,
      repoIds: [11],
    });
    const repos: unknown = (await alice.get('/api/v1/repositories').expect(200)).body;
    aliceRepoId = RepositoryPageSchema.parse(repos).items[0]?.id ?? '';
  });

  afterEach(async () => {
    await app.close();
  });

  function createTask(agent: Agent, body: object, key: string | null = newKey()) {
    const request = agent.post('/api/v1/tasks');
    if (key) request.set(IDEMPOTENCY_KEY_HEADER, key);
    return request.send(body);
  }

  it('accepts a task with 202, stores it as queued, and enqueues exactly one job', async () => {
    const response = await createTask(alice, { repositoryId: aliceRepoId, instruction }).expect(
      202,
    );

    const { id, status } = CreateTaskResponseSchema.parse(response.body);
    expect(status).toBe('queued');
    expect(queue.jobIds).toEqual([`run-start-${id}`]);

    const task = TaskSchema.parse((await alice.get(`/api/v1/tasks/${id}`).expect(200)).body);
    expect(task).toMatchObject({ baseBranch: 'main', status: 'queued', cancelRequestedAt: null });
  });

  describe('idempotency', () => {
    it('requires an Idempotency-Key', async () => {
      const response = await createTask(
        alice,
        { repositoryId: aliceRepoId, instruction },
        null,
      ).expect(400);

      expect(ProblemDetailsSchema.parse(response.body).errors?.[0]?.path).toBe(
        'headers.idempotency-key',
      );
    });

    it('replays the original response for a retried request: one task, one job', async () => {
      const key = newKey();
      const first = await createTask(alice, { repositoryId: aliceRepoId, instruction }, key).expect(
        202,
      );
      const retry = await createTask(alice, { instruction, repositoryId: aliceRepoId }, key).expect(
        202,
      );

      expect(retry.body).toEqual(first.body); // same task id, key order didn't matter
      expect(tasks.rows.size).toBe(1);
      expect(queue.jobIds).toHaveLength(1);
    });

    it('refuses the same key with a different body', async () => {
      const key = newKey();
      await createTask(alice, { repositoryId: aliceRepoId, instruction }, key).expect(202);

      const response = await createTask(
        alice,
        { repositoryId: aliceRepoId, instruction: 'A completely different task.' },
        key,
      ).expect(422);
      expect(ProblemDetailsSchema.parse(response.body).code).toBe('idempotency_key_reused');
    });

    it('scopes keys per user', async () => {
      const key = newKey();
      await createTask(alice, { repositoryId: aliceRepoId, instruction }, key).expect(202);

      // Same key from Bob is a different request (and Bob can't use Alice's repo anyway).
      await createTask(bob, { repositoryId: aliceRepoId, instruction }, key).expect(404);
    });

    it('releases the key when the request fails, so the client can retry', async () => {
      const key = newKey();
      queue.failNext = true;
      await createTask(alice, { repositoryId: aliceRepoId, instruction }, key).expect(503);

      await createTask(alice, { repositoryId: aliceRepoId, instruction }, key).expect(202);
    });
  });

  it("can't create a task on someone else's repository", async () => {
    const response = await createTask(bob, { repositoryId: aliceRepoId, instruction }).expect(404);

    expect(ProblemDetailsSchema.parse(response.body).detail).toBe('Repository was not found.');
    expect(tasks.rows.size).toBe(0);
  });

  it('marks the task failed (never stuck in queued) when it cannot be enqueued', async () => {
    queue.failNext = true;

    const response = await createTask(alice, { repositoryId: aliceRepoId, instruction }).expect(
      503,
    );

    expect(ProblemDetailsSchema.parse(response.body).code).toBe('service_unavailable');
    const [stored] = [...tasks.rows.values()];
    expect(stored).toMatchObject({ status: 'failed', failureReason: 'internal_error' });
  });

  it('lists only your own tasks, newest first', async () => {
    const first = CreateTaskResponseSchema.parse(
      (await createTask(alice, { repositoryId: aliceRepoId, instruction }).expect(202)).body,
    );
    const second = CreateTaskResponseSchema.parse(
      (
        await createTask(alice, {
          repositoryId: aliceRepoId,
          instruction: `${instruction} Again.`,
        }).expect(202)
      ).body,
    );

    const page = TaskPageSchema.parse((await alice.get('/api/v1/tasks').expect(200)).body);
    expect(page.items.map((t) => t.id)).toEqual([second.id, first.id]);

    const bobs = TaskPageSchema.parse((await bob.get('/api/v1/tasks').expect(200)).body);
    expect(bobs.items).toEqual([]);
    await bob.get(`/api/v1/tasks/${first.id}`).expect(404);
  });

  describe('cancel', () => {
    async function queuedTask(): Promise<string> {
      const response = await createTask(alice, { repositoryId: aliceRepoId, instruction }).expect(
        202,
      );
      return CreateTaskResponseSchema.parse(response.body).id;
    }

    it('cancels a queued task immediately', async () => {
      const id = await queuedTask();

      const task = TaskSchema.parse(
        (await alice.post(`/api/v1/tasks/${id}/cancel`).expect(200)).body,
      );

      expect(task.status).toBe('cancelled');
    });

    it('asks a running task to stop at its next safe point', async () => {
      const id = await queuedTask();
      const stored = tasks.rows.get(id);
      if (stored) Object.assign(stored, { status: 'investigating' });

      const task = TaskSchema.parse(
        (await alice.post(`/api/v1/tasks/${id}/cancel`).expect(200)).body,
      );

      expect(task.status).toBe('investigating');
      expect(task.cancelRequestedAt).not.toBeNull();
    });

    it('refuses to cancel a finished task', async () => {
      const id = await queuedTask();
      await alice.post(`/api/v1/tasks/${id}/cancel`).expect(200);

      const response = await alice.post(`/api/v1/tasks/${id}/cancel`).expect(409);
      expect(ProblemDetailsSchema.parse(response.body).code).toBe('invalid_state_transition');
    });

    it("can't cancel someone else's task", async () => {
      const id = await queuedTask();

      await bob.post(`/api/v1/tasks/${id}/cancel`).expect(404);
      expect(tasks.rows.get(id)?.status).toBe('queued');
    });
  });
});
