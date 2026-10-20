import { type TaskEvent, type TaskEventInput, TaskEventSchema } from '@forgeops/contracts';
import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { TaskEventStore } from '../application/event-ports.js';

type EventRow = Prisma.AgentEventGetPayload<object>;

@Injectable()
export class PrismaTaskEventStore extends TaskEventStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  append(taskId: string, input: TaskEventInput): Promise<TaskEvent> {
    const { type, ...payload } = input;
    const cost = input.type === 'llm.called' ? (input.costUsd ?? 0) : 0;
    return this.prisma.$transaction(async (tx) => {
      // UPDATE tasks SET event_seq = event_seq + 1 … RETURNING event_seq: the row lock makes
      // concurrent writers (worker + a cancel from the API) take turns, so seq has no gaps
      // and no duplicates.
      const { eventSeq } = await tx.task.update({
        where: { id: taskId },
        data: { eventSeq: { increment: 1 }, ...(cost > 0 && { costUsd: { increment: cost } }) },
        select: { eventSeq: true },
      });
      const row = await tx.agentEvent.create({
        data: { taskId, seq: eventSeq, type, payload },
      });
      return toEvent(row);
    });
  }

  async listAfter(taskId: string, afterSeq: number, limit: number): Promise<TaskEvent[]> {
    const rows = await this.prisma.agentEvent.findMany({
      where: { taskId, seq: { gt: afterSeq } },
      orderBy: { seq: 'asc' },
      take: limit,
    });
    return rows.map(toEvent);
  }
}

function toEvent(row: EventRow): TaskEvent {
  // Stored JSON is parsed back through the contract: a row written by an older version that
  // no longer matches fails loudly here instead of sending malformed data to the browser.
  return TaskEventSchema.parse({
    ...(row.payload as Record<string, unknown>),
    type: row.type,
    seq: row.seq,
    taskId: row.taskId,
    createdAt: row.createdAt.toISOString(),
  });
}
