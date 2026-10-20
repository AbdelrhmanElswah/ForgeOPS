import type { TaskFailureReason, TaskStatus } from '@forgeops/contracts';

export interface TaskRecord {
  id: string;
  userId: string;
  repositoryId: string;
  instruction: string;
  baseBranch: string;
  baseCommitSha: string | null;
  status: TaskStatus;
  /** Optimistic-lock counter: incremented by every status change. */
  version: number;
  failureReason: TaskFailureReason | null;
  failureDetail: string | null;
  costUsd: number;
  cancelRequestedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewTask {
  userId: string;
  repositoryId: string;
  instruction: string;
  baseBranch: string;
}

/** Fields that may change together with a status (never on their own through this port). */
export interface TransitionPatch {
  failureReason?: TaskFailureReason;
  failureDetail?: string;
  baseCommitSha?: string;
  startedAt?: Date;
  finishedAt?: Date;
}

export interface TaskListQuery {
  limit: number;
  cursor?: string;
  status?: TaskStatus;
  repositoryId?: string;
}

export abstract class TasksRepository {
  abstract create(task: NewTask): Promise<TaskRecord>;
  abstract findById(id: string): Promise<TaskRecord | null>;
  /** Reads filter by owner inside the query (see RepositoriesRepository for the reasoning). */
  abstract findOwned(userId: string, id: string): Promise<TaskRecord | null>;
  abstract listOwned(
    userId: string,
    query: TaskListQuery,
  ): Promise<{ items: TaskRecord[]; nextCursor: string | null }>;

  /**
   * Compare-and-set: applies the change only if the stored version still equals
   * `expectedVersion`. Returns null when someone else changed the task first (lost race).
   */
  abstract transition(
    id: string,
    expectedVersion: number,
    to: TaskStatus,
    patch?: TransitionPatch,
  ): Promise<TaskRecord | null>;

  /** Idempotent: the first request time is kept. */
  abstract requestCancel(id: string, at: Date): Promise<TaskRecord>;
}
