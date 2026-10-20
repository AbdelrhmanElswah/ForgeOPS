import type { TaskEvent, TaskEventInput } from '@forgeops/contracts';

/** Port: durable, ordered event storage. The source of truth for a task's timeline. */
export abstract class TaskEventStore {
  /**
   * Assigns the next `seq` for the task and stores the event, atomically. An `llm.called`
   * event also adds its cost to the task's running total in the same transaction, so the
   * cost shown on a task always equals the sum of its recorded calls.
   */
  abstract append(taskId: string, input: TaskEventInput): Promise<TaskEvent>;
  /** Events with seq > afterSeq, in order. */
  abstract listAfter(taskId: string, afterSeq: number, limit: number): Promise<TaskEvent[]>;
}

/** Port: low-latency fan-out of stored events to live subscribers (best effort). */
export abstract class TaskEventBus {
  abstract publish(event: TaskEvent): Promise<void>;
  /** Returns an unsubscribe function. */
  abstract subscribe(
    taskId: string,
    handler: (event: TaskEvent) => void,
  ): Promise<() => Promise<void>>;
}
