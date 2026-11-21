import {
  IdSchema,
  type ListTasksQuery,
  TASK_STATUSES,
  type Task,
  type TaskPage,
  type TaskStats,
  type TaskStatus,
} from '@forgeops/contracts';
import { Injectable } from '@nestjs/common';

import { NotFoundError, ValidationError } from '../../../common/errors/domain-error.js';
import { type TaskRecord, TasksRepository } from './tasks.repository.js';

/** Read side: owner-scoped lookups mapped to the API contract. */
@Injectable()
export class TaskQueries {
  constructor(private readonly tasks: TasksRepository) {}

  async get(userId: string, taskId: string): Promise<Task> {
    const task = await this.tasks.findOwned(userId, taskId);
    if (!task) {
      throw new NotFoundError('Task');
    }
    return toTaskDto(task);
  }

  async list(userId: string, query: ListTasksQuery): Promise<TaskPage> {
    if (query.cursor && !IdSchema.safeParse(query.cursor).success) {
      throw new ValidationError([{ path: 'cursor', message: 'Invalid cursor' }]);
    }
    const page = await this.tasks.listOwned(userId, query);
    return { items: page.items.map(toTaskDto), nextCursor: page.nextCursor };
  }

  async stats(userId: string): Promise<TaskStats> {
    const counts = await this.tasks.countOwnedByStatus(userId);
    return {
      byStatus: Object.fromEntries(TASK_STATUSES.map((s) => [s, counts[s] ?? 0])) as Record<
        TaskStatus,
        number
      >,
    };
  }
}

export function toTaskDto(task: TaskRecord): Task {
  return {
    id: task.id,
    repositoryId: task.repositoryId,
    instruction: task.instruction,
    baseBranch: task.baseBranch,
    baseCommitSha: task.baseCommitSha,
    status: task.status,
    failureReason: task.failureReason,
    costUsd: task.costUsd,
    cancelRequestedAt: task.cancelRequestedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
