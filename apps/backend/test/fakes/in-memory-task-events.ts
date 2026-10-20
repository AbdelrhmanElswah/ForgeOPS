import { type TaskEvent, type TaskEventInput, TaskEventSchema } from '@forgeops/contracts';

import { TaskEventBus, TaskEventStore } from '../../src/modules/events/application/event-ports.js';
import { TaskEventsService } from '../../src/modules/events/application/task-events.service.js';
import type { InMemoryTasksRepository } from './in-memory-tasks.repository.js';

/** Mirrors PrismaTaskEventStore: per-task gap-free seq, cost added to the task atomically. */
export class InMemoryTaskEventStore extends TaskEventStore {
  readonly events = new Map<string, TaskEvent[]>();

  constructor(private readonly tasks?: InMemoryTasksRepository) {
    super();
  }

  append(taskId: string, input: TaskEventInput): Promise<TaskEvent> {
    const list = this.events.get(taskId) ?? [];
    const event = TaskEventSchema.parse({
      ...input,
      seq: list.length + 1,
      taskId,
      createdAt: new Date().toISOString(),
    });
    list.push(event);
    this.events.set(taskId, list);
    const task = this.tasks?.rows.get(taskId);
    if (task && input.type === 'llm.called') task.costUsd += input.costUsd ?? 0;
    return Promise.resolve(event);
  }

  listAfter(taskId: string, afterSeq: number, limit: number): Promise<TaskEvent[]> {
    return Promise.resolve(
      (this.events.get(taskId) ?? []).filter((e) => e.seq > afterSeq).slice(0, limit),
    );
  }
}

/** In-process pub/sub. `dropMessages` simulates Redis losing messages. */
export class InMemoryTaskEventBus extends TaskEventBus {
  dropMessages = false;
  private readonly handlers = new Map<string, Set<(event: TaskEvent) => void>>();

  publish(event: TaskEvent): Promise<void> {
    if (!this.dropMessages) {
      for (const handler of this.handlers.get(event.taskId) ?? []) handler(event);
    }
    return Promise.resolve();
  }

  subscribe(taskId: string, handler: (event: TaskEvent) => void): Promise<() => Promise<void>> {
    const set = this.handlers.get(taskId) ?? new Set();
    set.add(handler);
    this.handlers.set(taskId, set);
    return Promise.resolve(() => {
      set.delete(handler);
      return Promise.resolve();
    });
  }

  subscriberCount(taskId: string): number {
    return this.handlers.get(taskId)?.size ?? 0;
  }
}

/** A TaskEventsService wired to in-memory adapters, for unit tests. */
export function inMemoryTaskEvents(tasks?: InMemoryTasksRepository) {
  const store = new InMemoryTaskEventStore(tasks);
  const bus = new InMemoryTaskEventBus();
  return { store, bus, service: new TaskEventsService(store, bus) };
}
