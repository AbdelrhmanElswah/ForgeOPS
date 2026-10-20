import { z } from 'zod';

import { IdSchema, TimestampSchema } from '../common/primitives.js';
import { TaskFailureReasonSchema, TaskStatusSchema } from './task-status.js';

const AgentRoleSchema = z.enum(['planner', 'investigator', 'implementer', 'reviewer']);

/** Fields every event has. `seq` is per task, gap-free and strictly increasing. */
const base = {
  seq: z.number().int().positive(),
  taskId: IdSchema,
  createdAt: TimestampSchema,
};

/**
 * Everything the dashboard's live timeline shows. A discriminated union on `type`, so the
 * frontend can `switch (event.type)` with full type safety. Payloads never contain secrets
 * or file contents: only what to display.
 */
export const TaskEventSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('status.changed'),
    status: TaskStatusSchema,
    failureReason: TaskFailureReasonSchema.nullable(),
  }),
  z.object({ ...base, type: z.literal('node.started'), node: z.string() }),
  z.object({
    ...base,
    type: z.literal('node.completed'),
    node: z.string(),
    durationMs: z.number().int().nonnegative(),
  }),
  z.object({
    ...base,
    type: z.literal('llm.called'),
    role: AgentRoleSchema,
    model: z.string(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative().nullable(),
  }),
  z.object({
    ...base,
    type: z.literal('tool.called'),
    role: AgentRoleSchema,
    tool: z.string(),
    ok: z.boolean(),
    durationMs: z.number().int().nonnegative(),
    error: z.string().optional(),
  }),
]);
export type TaskEvent = z.infer<typeof TaskEventSchema>;
export type TaskEventType = TaskEvent['type'];

/** An event before it is stored: the server assigns seq, taskId and createdAt. */
export type TaskEventInput = TaskEvent extends infer E
  ? E extends TaskEvent
    ? Omit<E, 'seq' | 'taskId' | 'createdAt'>
    : never
  : never;

/** SSE event name for keepalives; clients listening with `onmessage` never see it. */
export const TASK_EVENT_HEARTBEAT = 'heartbeat';
