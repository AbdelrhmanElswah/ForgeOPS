import { Injectable } from '@nestjs/common';

import { NotFoundError } from '../../../common/errors/domain-error.js';
import { assertTransition } from '../domain/task-status.js';
import { TaskLifecycleService } from './task-lifecycle.service.js';
import { type TaskRecord, TasksRepository } from './tasks.repository.js';

/**
 * Cancellation is cooperative. A task nobody is working on (queued, or waiting for approval)
 * is cancelled at once. A running task gets `cancelRequestedAt`; the worker checks it between
 * steps and aborts in-flight model and sandbox calls, so it stops at a safe point instead of
 * being killed halfway through an operation.
 */
@Injectable()
export class CancelTaskUseCase {
  constructor(
    private readonly tasks: TasksRepository,
    private readonly lifecycle: TaskLifecycleService,
  ) {}

  async execute(userId: string, taskId: string): Promise<TaskRecord> {
    const task = await this.tasks.findOwned(userId, taskId);
    if (!task) {
      throw new NotFoundError('Task');
    }
    // Terminal tasks and "publishing" can't be cancelled: say so with the state machine's error.
    assertTransition(task.status, 'cancelled');

    if (task.status === 'queued' || task.status === 'awaiting_approval') {
      return this.lifecycle.transition(task.id, 'cancelled');
    }
    return this.tasks.requestCancel(task.id, new Date());
  }
}
