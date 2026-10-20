import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryTasksRepository } from '../../../../test/fakes/in-memory-tasks.repository.js';
import { ConflictError } from '../../../common/errors/domain-error.js';
import { InvalidStateTransitionError } from '../domain/task-status.js';
import { TaskLifecycleService } from './task-lifecycle.service.js';

describe('TaskLifecycleService', () => {
  let tasks: InMemoryTasksRepository;
  let lifecycle: TaskLifecycleService;
  let taskId: string;

  beforeEach(async () => {
    tasks = new InMemoryTasksRepository();
    lifecycle = new TaskLifecycleService(tasks);
    taskId = (
      await tasks.create({ userId: 'u1', repositoryId: 'r1', instruction: 'x', baseBranch: 'main' })
    ).id;
  });

  it('applies a legal transition and bumps the version', async () => {
    const updated = await lifecycle.transition(taskId, 'planning', { startedAt: new Date() });

    expect(updated).toMatchObject({ status: 'planning', version: 1 });
    expect(updated.startedAt).toBeInstanceOf(Date);
  });

  it('stamps finishedAt when a task reaches a terminal status', async () => {
    const failed = await lifecycle.transition(taskId, 'failed', { failureReason: 'sandbox_error' });

    expect(failed.finishedAt).toBeInstanceOf(Date);
    expect(failed.failureReason).toBe('sandbox_error');
  });

  it('rejects an illegal transition', async () => {
    await expect(lifecycle.transition(taskId, 'publishing')).rejects.toBeInstanceOf(
      InvalidStateTransitionError,
    );
  });

  it('re-validates after losing a race: a concurrent cancel wins, the worker’s move fails', async () => {
    let raced = false;
    tasks.beforeTransition = (task) => {
      if (!raced) {
        raced = true;
        // Another request cancels the task between our read and our write.
        Object.assign(task, { status: 'cancelled', version: task.version + 1 });
      }
    };

    await expect(lifecycle.transition(taskId, 'planning')).rejects.toBeInstanceOf(
      InvalidStateTransitionError,
    );
    expect((await tasks.findById(taskId))?.status).toBe('cancelled');
  });

  it('retries a lost race when the move is still legal', async () => {
    let raced = false;
    tasks.beforeTransition = (task) => {
      if (!raced) {
        raced = true;
        Object.assign(task, { version: task.version + 1 }); // e.g. cancelRequestedAt was set
      }
    };

    await expect(lifecycle.transition(taskId, 'planning')).resolves.toMatchObject({
      status: 'planning',
    });
  });

  it('gives up under persistent contention', async () => {
    tasks.beforeTransition = (task) => {
      Object.assign(task, { version: task.version + 1 });
    };

    await expect(lifecycle.transition(taskId, 'planning')).rejects.toBeInstanceOf(ConflictError);
  });
});
