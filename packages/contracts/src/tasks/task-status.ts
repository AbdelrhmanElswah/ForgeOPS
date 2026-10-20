import { z } from 'zod';

/**
 * Every state a task can be in, in lifecycle order (see docs/ARCHITECTURE.md §9).
 * The allowed transitions between them are business rules, so they live in the
 * backend domain (`tasks/domain`), not here.
 */
export const TASK_STATUSES = [
  'queued',
  'planning',
  'investigating',
  'implementing',
  'verifying',
  'awaiting_approval',
  'publishing',
  'completed',
  'rejected',
  'failed',
  'cancelled',
] as const;

export const TaskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/** Statuses a task never leaves. The UI uses this to stop listening for live events. */
export const TERMINAL_TASK_STATUSES = [
  'completed',
  'rejected',
  'failed',
  'cancelled',
] as const satisfies readonly TaskStatus[];

/** Statuses in which the agent graph is actively doing work. */
export const ACTIVE_TASK_STATUSES = [
  'planning',
  'investigating',
  'implementing',
  'verifying',
  'publishing',
] as const satisfies readonly TaskStatus[];

export function isTerminalStatus(status: TaskStatus): boolean {
  return (TERMINAL_TASK_STATUSES as readonly TaskStatus[]).includes(status);
}

export const TASK_FAILURE_REASONS = [
  'budget_exceeded',
  'tests_failed',
  'invalid_llm_output',
  'stale_base',
  'sandbox_error',
  'github_error',
  'guard_violation',
  'internal_error',
] as const;

export const TaskFailureReasonSchema = z.enum(TASK_FAILURE_REASONS);
export type TaskFailureReason = z.infer<typeof TaskFailureReasonSchema>;
