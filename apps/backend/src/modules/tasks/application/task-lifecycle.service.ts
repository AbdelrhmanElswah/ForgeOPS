import { isTerminalStatus, type TaskStatus } from '@forgeops/contracts';
import { Injectable, Logger } from '@nestjs/common';

import { ConflictError, NotFoundError } from '../../../common/errors/domain-error.js';
import { TaskEventsService } from '../../events/application/task-events.service.js';
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
  private readonly logger = new Logger(TaskLifecycleService.name);

  constructor(
    private readonly tasks: TasksRepository,
    private readonly events: TaskEventsService,
  ) {}

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
        await this.recordStatus(updated);
        return updated;
      }
    }
    throw new ConflictError('The task was changed concurrently; please retry.');
  }

  /**
   * The status itself is already committed; the event only feeds the live timeline. A failed
   * write is logged rather than thrown, so it can't undo or block a valid status change
   * (clients still see the status through GET /tasks/:id).
   */
  private async recordStatus(task: TaskRecord): Promise<void> {
    await this.events
      .record(task.id, {
        type: 'status.changed',
        status: task.status,
        failureReason: task.failureReason,
      })
      .catch((error: unknown) => {
        this.logger.error({ err: error, taskId: task.id }, 'Could not record status event');
      });
  }
}
