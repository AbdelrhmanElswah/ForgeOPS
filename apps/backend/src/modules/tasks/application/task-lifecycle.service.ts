import { isTerminalStatus, type TaskStatus } from '@forgeops/contracts';
import { Injectable } from '@nestjs/common';

import { ConflictError, NotFoundError } from '../../../common/errors/domain-error.js';
import { assertTransition } from '../domain/task-status.js';
import { type TaskRecord, TasksRepository, type TransitionPatch } from './tasks.repository.js';

/** A lost race is retried a few times; persistent contention means something is wrong. */
const MAX_ATTEMPTS = 3;

/**
 * The only way a task's status changes. Each attempt reads the current state, checks the
 * transition against the state machine, and writes with compare-and-set on `version`.
 *
 * On a lost race the attempt is *re-validated*, not blindly re-applied: if a user cancelled the
 * task while the worker tried to move it to "investigating", the retry sees "cancelled" and
 * the illegal move fails, which tells the worker to stop.
 */
@Injectable()
export class TaskLifecycleService {
  constructor(private readonly tasks: TasksRepository) {}

  async transition(
    taskId: string,
    to: TaskStatus,
    patch: TransitionPatch = {},
  ): Promise<TaskRecord> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const task = await this.tasks.findById(taskId);
      if (!task) {
        throw new NotFoundError('Task');
      }
      assertTransition(task.status, to);

      const updated = await this.tasks.transition(task.id, task.version, to, {
        ...(isTerminalStatus(to) && { finishedAt: new Date() }),
        ...patch,
      });
      if (updated) {
        return updated;
      }
    }
    throw new ConflictError('The task was changed concurrently; please retry.');
  }
}
