import { z } from 'zod';

import { PageQuerySchema, pageOf } from '../common/pagination.js';
import {
  CommitShaSchema,
  GitRefNameSchema,
  IdSchema,
  TimestampSchema,
} from '../common/primitives.js';
import { TaskFailureReasonSchema, TaskStatusSchema } from './task-status.js';

export const INSTRUCTION_MIN_LENGTH = 10;
export const INSTRUCTION_MAX_LENGTH = 4000;

export const TaskInstructionSchema = z
  .string()
  .trim()
  .min(INSTRUCTION_MIN_LENGTH, 'Describe the task in at least a few words')
  .max(INSTRUCTION_MAX_LENGTH);

// ── Requests ────────────────────────────────────────────────────────────────

/** Body of `POST /api/v1/tasks`. `strictObject` rejects unknown keys such as a smuggled `status`. */
export const CreateTaskRequestSchema = z.strictObject({
  repositoryId: IdSchema,
  instruction: TaskInstructionSchema,
  /** Defaults to the repository's default branch when omitted. */
  baseBranch: GitRefNameSchema.optional(),
});
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;

/** Query of `GET /api/v1/tasks`. */
export const ListTasksQuerySchema = PageQuerySchema.extend({
  status: TaskStatusSchema.optional(),
  repositoryId: IdSchema.optional(),
});
export type ListTasksQuery = z.infer<typeof ListTasksQuerySchema>;

// ── Responses ───────────────────────────────────────────────────────────────

/** A task as the API returns it. Internal fields (version, userId, …) are not part of the contract. */
export const TaskSchema = z.object({
  id: IdSchema,
  repositoryId: IdSchema,
  instruction: z.string(),
  baseBranch: GitRefNameSchema,
  /** Pinned when the run starts; null while the task is still queued. */
  baseCommitSha: CommitShaSchema.nullable(),
  status: TaskStatusSchema,
  failureReason: TaskFailureReasonSchema.nullable(),
  costUsd: z.number().nonnegative(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Task = z.infer<typeof TaskSchema>;

/** `202 Accepted` body of `POST /api/v1/tasks`: the work happens later in the worker. */
export const CreateTaskResponseSchema = TaskSchema.pick({ id: true, status: true });
export type CreateTaskResponse = z.infer<typeof CreateTaskResponseSchema>;

export const TaskPageSchema = pageOf(TaskSchema);
export type TaskPage = z.infer<typeof TaskPageSchema>;
