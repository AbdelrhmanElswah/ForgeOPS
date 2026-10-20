export const AGENT_RUNS_QUEUE = 'agent-runs';
export const RUN_START_JOB = 'run.start';

export interface RunStartJob {
  taskId: string;
}

/**
 * Deterministic job id: enqueueing the same task twice yields one job (BullMQ ignores a
 * duplicate id). BullMQ forbids ":" in custom ids, hence the dashes.
 */
export const runStartJobId = (taskId: string) => `run-start-${taskId}`;

/** Port: hand a task to the Worker process. */
export abstract class TaskQueue {
  abstract enqueueRun(taskId: string): Promise<void>;
}
