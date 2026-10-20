import { randomUUID } from 'node:crypto';

import type { TaskStatus } from '@forgeops/contracts';

import {
  type NewTask,
  type TaskListQuery,
  type TaskRecord,
  TasksRepository,
  type TransitionPatch,
} from '../../src/modules/tasks/application/tasks.repository.js';

/** In-memory TasksRepository with the same compare-and-set semantics as the Prisma adapter. */
export class InMemoryTasksRepository extends TasksRepository {
  readonly rows = new Map<string, TaskRecord>();
  /** Test hook: runs right before a compare-and-set, to simulate a concurrent writer. */
  beforeTransition?: (task: TaskRecord) => void;
  private sequence = 0;

  create(task: NewTask): Promise<TaskRecord> {
    const now = new Date();
    // Ids increase like UUID v7, so "newest first" ordering matches production.
    const id = `${String(++this.sequence).padStart(8, '0')}-0000-7000-8000-${randomUUID().slice(-12)}`;
    const record: TaskRecord = {
      id,
      ...task,
      baseCommitSha: null,
      status: 'queued',
      version: 0,
      failureReason: null,
      failureDetail: null,
      costUsd: 0,
      cancelRequestedAt: null,
      startedAt: null,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(id, record);
    return Promise.resolve({ ...record });
  }

  findById(id: string): Promise<TaskRecord | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row ? { ...row } : null);
  }

  findOwned(userId: string, id: string): Promise<TaskRecord | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row?.userId === userId ? { ...row } : null);
  }

  listOwned(
    userId: string,
    { limit, cursor, status, repositoryId }: TaskListQuery,
  ): Promise<{ items: TaskRecord[]; nextCursor: string | null }> {
    const rows = [...this.rows.values()]
      .filter(
        (t) =>
          t.userId === userId &&
          (!status || t.status === status) &&
          (!repositoryId || t.repositoryId === repositoryId) &&
          (!cursor || t.id < cursor),
      )
      .sort((a, b) => b.id.localeCompare(a.id));
    const page = rows.slice(0, limit);
    return Promise.resolve({
      items: page.map((t) => ({ ...t })),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    });
  }

  transition(
    id: string,
    expectedVersion: number,
    to: TaskStatus,
    patch: TransitionPatch = {},
  ): Promise<TaskRecord | null> {
    const current = this.rows.get(id);
    if (current) this.beforeTransition?.(current);
    const row = this.rows.get(id);
    if (row?.version !== expectedVersion) {
      return Promise.resolve(null);
    }
    Object.assign(row, patch, { status: to, version: row.version + 1, updatedAt: new Date() });
    return Promise.resolve({ ...row });
  }

  requestCancel(id: string, at: Date): Promise<TaskRecord> {
    const row = this.rows.get(id);
    if (!row) return Promise.reject(new Error(`Task ${id} not found`));
    row.cancelRequestedAt ??= at;
    return Promise.resolve({ ...row });
  }
}
