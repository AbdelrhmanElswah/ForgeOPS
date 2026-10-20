import type { z } from 'zod';

import type { PathAccess } from '../policies/path-guard.js';
import type { AgentRole } from '../roles.js';

export interface ToolContext {
  role: AgentRole;
  /** Aborted on task cancellation or when the tool's time limit is reached. */
  signal: AbortSignal;
}

/**
 * A capability the model may call. Tools are small and typed: the input schema is the
 * contract the model sees and the executor enforces; `roles` is the allowlist.
 * Infrastructure (the workspace, the sandbox) is captured when the tool is created, through
 * ports, so this package stays free of filesystem and Docker code.
 */
export interface AgentTool<I extends z.ZodObject = z.ZodObject> {
  name: string;
  description: string;
  /** Use z.strictObject: unknown keys are rejected rather than ignored. */
  input: I;
  roles: readonly AgentRole[];
  /** String fields of `input` that are repository paths; checked and normalised by PathGuard. */
  pathFields?: readonly { field: keyof z.output<I> & string; access: PathAccess }[];
  /** Returns text for the model. Throw ToolError for failures the model should see and handle. */
  execute(input: z.output<I>, context: ToolContext): Promise<string>;
}

/** Identity helper that keeps the input type flowing into `execute`. */
export function defineTool<I extends z.ZodObject>(tool: AgentTool<I>): AgentTool<I> {
  return tool;
}

/** An expected failure ("file not found"): its message is shown to the model so it can adapt. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}
