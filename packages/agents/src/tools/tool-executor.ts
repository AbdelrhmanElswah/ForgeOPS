import { performance } from 'node:perf_hooks';

import { type BudgetLimits, assertWithinBudget } from '../policies/budget.js';
import { PathGuard } from '../policies/path-guard.js';
import { truncateMiddle } from '../policies/untrusted-content.js';
import type { AgentEventSink } from '../ports/events.port.js';
import type { LlmToolCall, LlmUserContent } from '../ports/llm.port.js';
import type { AgentRole } from '../roles.js';
import type { BudgetUsage } from '../state/agent-state.js';
import { ToolError } from './tool.js';
import type { ToolRegistry } from './tool-registry.js';

export interface ToolExecutorOptions {
  registry: ToolRegistry;
  limits: BudgetLimits;
  events: AgentEventSink;
  /** Repository settings `deniedPaths`, on top of the built-in denylist. */
  extraDeniedPaths?: readonly string[];
  maxOutputChars?: number;
  timeoutMs?: number;
}

export interface ToolCallContext {
  role: AgentRole;
  budget: BudgetUsage;
  signal?: AbortSignal;
}

export interface ToolOutcome {
  result: Extract<LlmUserContent, { type: 'tool_result' }>;
  budgetDelta: Partial<BudgetUsage>;
}

type Step = { ok: true; input: Record<string, unknown> } | { ok: false; reason: string };

/**
 * Runs one model tool call through the policy chain (Chain of Responsibility):
 *
 *   budget → known tool → role allowed → schema → paths → execute (timeout) → truncate → event
 *
 * Two kinds of failure, handled differently:
 * - Model mistakes (unknown tool, wrong role, bad arguments, denied path, ToolError) come
 *   back as an error *result*: the model reads it and can correct itself.
 * - Hard limits (budget) and cancellation *throw*: the run stops, whatever the model wants.
 */
export class ToolExecutor {
  private readonly pathGuard: PathGuard;
  private readonly maxOutputChars: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: ToolExecutorOptions) {
    this.pathGuard = new PathGuard(options.extraDeniedPaths);
    this.maxOutputChars = options.maxOutputChars ?? 20_000;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async execute(call: LlmToolCall, context: ToolCallContext): Promise<ToolOutcome> {
    // Every attempt counts, even rejected ones: a model stuck sending invalid calls must
    // still run into the limit instead of looping forever.
    assertWithinBudget(context.budget, this.options.limits, { toolCalls: 1 });
    context.signal?.throwIfAborted();

    const startedAt = performance.now();
    const step = this.validate(call, context.role);
    let content: string;
    let failure: string | undefined;

    if (!step.ok) {
      failure = step.reason;
      content = step.reason;
    } else {
      try {
        content = await this.run(call.name, step.input, context);
      } catch (error) {
        if (context.signal?.aborted) throw error; // cancellation wins over everything
        failure = error instanceof ToolError ? error.message : 'The tool failed unexpectedly.';
        content = failure;
      }
    }

    await this.options.events.emit({
      type: 'tool.called',
      role: context.role,
      tool: call.name,
      ok: failure === undefined,
      durationMs: Math.round(performance.now() - startedAt),
      ...(failure !== undefined && { error: failure.slice(0, 200) }),
    });

    return {
      result: {
        type: 'tool_result',
        toolCallId: call.id,
        content: truncateMiddle(content, this.maxOutputChars),
        ...(failure !== undefined && { isError: true }),
      },
      budgetDelta: { toolCalls: 1 },
    };
  }

  private validate(call: LlmToolCall, role: AgentRole): Step {
    const tool = this.options.registry.get(call.name);
    if (!tool) {
      return { ok: false, reason: `Unknown tool "${call.name}".` };
    }
    if (!tool.roles.includes(role)) {
      return { ok: false, reason: `The tool "${call.name}" is not available to the ${role}.` };
    }

    const parsed = tool.input.safeParse(call.input);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((issue) => `${issue.path.map(String).join('.') || 'input'}: ${issue.message}`)
        .join('; ');
      return { ok: false, reason: `Invalid arguments for "${call.name}": ${issues}` };
    }

    const input = { ...parsed.data } as Record<string, unknown>;
    for (const { field, access } of tool.pathFields ?? []) {
      const value = input[field];
      if (typeof value !== 'string') continue;
      const checked = this.pathGuard.check(value, access);
      if (!checked.ok) {
        return { ok: false, reason: checked.reason };
      }
      input[field] = checked.path; // tools only ever see the normalised path
    }
    return { ok: true, input };
  }

  private async run(
    name: string,
    input: Record<string, unknown>,
    context: ToolCallContext,
  ): Promise<string> {
    const tool = this.options.registry.get(name);
    if (!tool) throw new Error(`Tool "${name}" disappeared from the registry.`);

    // The timer must be cleared as soon as the tool settles. A timeout promise left pending
    // would reject later with no handler, and Node terminates on unhandled rejections.
    const timeout = new AbortController();
    const signal = context.signal
      ? AbortSignal.any([context.signal, timeout.signal])
      : timeout.signal;
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timeout.abort(); // tell the tool to stop its work, not just stop waiting for it
        reject(new ToolError(`The tool timed out after ${String(this.timeoutMs)} ms.`));
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([tool.execute(input, { role: context.role, signal }), timedOut]);
    } finally {
      clearTimeout(timer);
    }
  }
}
