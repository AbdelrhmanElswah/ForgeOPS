import type { CreateTaskRequest } from '@forgeops/contracts';
import { Injectable, Logger } from '@nestjs/common';

import { NotFoundError, ServiceUnavailableError } from '../../../common/errors/domain-error.js';
import { TaskQueue } from '../../../infrastructure/queue/task-queue.js';
import { RepositoriesRepository } from '../../repositories/application/repositories.repository.js';
import { TaskLifecycleService } from './task-lifecycle.service.js';
import { type TaskRecord, TasksRepository } from './tasks.repository.js';

/**
 * Accepts a task and hands it to the Worker. The HTTP request never runs agent work: it
 * persists the task, enqueues a job, and returns 202 within milliseconds.
 */
@Injectable()
export class CreateTaskUseCase {
  private readonly logger = new Logger(CreateTaskUseCase.name);

  constructor(
    private readonly tasks: TasksRepository,
    private readonly repositories: RepositoriesRepository,
    private readonly queue: TaskQueue,
    private readonly lifecycle: TaskLifecycleService,
  ) {}

  async execute(userId: string, request: CreateTaskRequest): Promise<TaskRecord> {
    const repository = await this.repositories.findOwned(userId, request.repositoryId);
    if (!repository) {
      throw new NotFoundError('Repository');
    }

    const task = await this.tasks.create({
      userId,
      repositoryId: repository.id,
      instruction: request.instruction,
      baseBranch: request.baseBranch ?? repository.defaultBranch,
    });

    try {
      await this.queue.enqueueRun(task.id);
    } catch (error) {
      // Saved but not queued would mean a task stuck in "queued" forever. Fail it visibly
      // instead, and tell the client to retry (with a new Idempotency-Key, it's a new task).
      this.logger.error({ err: error, taskId: task.id }, 'Could not enqueue task');
      await this.lifecycle
        .transition(task.id, 'failed', {
          failureReason: 'internal_error',
          failureDetail: 'The task could not be queued.',
        })
        .catch((cleanupError: unknown) => {
          this.logger.error({ err: cleanupError, taskId: task.id }, 'Could not mark task failed');
        });
      throw new ServiceUnavailableError('The task could not be queued. Please try again shortly.');
    }

    this.logger.log({ taskId: task.id, repositoryId: repository.id }, 'Task queued');
    return task;
  }
}
