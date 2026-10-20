import type { TaskStatus } from '@forgeops/contracts';
import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import {
  type NewTask,
  type TaskListQuery,
  type TaskRecord,
  TasksRepository,
  type TransitionPatch,
} from '../application/tasks.repository.js';

type TaskRow = Prisma.TaskGetPayload<object>;

function toRecord(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    userId: row.userId,
    repositoryId: row.repositoryId,
    instruction: row.instruction,
    baseBranch: row.baseBranch,
    baseCommitSha: row.baseCommitSha,
    status: row.status,
    version: row.version,
    failureReason: row.failureReason,
    failureDetail: row.failureDetail,
    // Decimal in the database (money), number in the API: 4 decimal places fit a double exactly enough.
    costUsd: row.costUsd.toNumber(),
    cancelRequestedAt: row.cancelRequestedAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaTasksRepository extends TasksRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(task: NewTask): Promise<TaskRecord> {
    return toRecord(await this.prisma.task.create({ data: task }));
  }

  async findById(id: string): Promise<TaskRecord | null> {
    const row = await this.prisma.task.findUnique({ where: { id } });
    return row && toRecord(row);
  }

  async findOwned(userId: string, id: string): Promise<TaskRecord | null> {
    const row = await this.prisma.task.findFirst({ where: { id, userId } });
    return row && toRecord(row);
  }

  async listOwned(
    userId: string,
    { limit, cursor, status, repositoryId }: TaskListQuery,
  ): Promise<{ items: TaskRecord[]; nextCursor: string | null }> {
    // Newest first. UUID v7 ids sort by creation time, so the cursor is "older than this id".
    const rows = await this.prisma.task.findMany({
      where: {
        userId,
        ...(status && { status }),
        ...(repositoryId && { repositoryId }),
        ...(cursor && { id: { lt: cursor } }),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map(toRecord),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async transition(
    id: string,
    expectedVersion: number,
    to: TaskStatus,
    patch: TransitionPatch = {},
  ): Promise<TaskRecord | null> {
    // One atomic statement: UPDATE tasks SET status=…, version=version+1 WHERE id=? AND version=?
    const { count } = await this.prisma.task.updateMany({
      where: { id, version: expectedVersion },
      data: { status: to, version: { increment: 1 }, ...patch },
    });
    return count === 0 ? null : this.findById(id);
  }

  async requestCancel(id: string, at: Date): Promise<TaskRecord> {
    await this.prisma.task.updateMany({
      where: { id, cancelRequestedAt: null },
      data: { cancelRequestedAt: at },
    });
    const row = await this.prisma.task.findUniqueOrThrow({ where: { id } });
    return toRecord(row);
  }
}
