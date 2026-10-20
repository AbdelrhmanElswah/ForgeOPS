import type { LlmUsage } from '../ports/llm.port.js';
import { addBudget, type BudgetUsage } from '../state/agent-state.js';

/** The budget cost of one LLM call. An unpriced model adds 0 to cost; the call still counts. */
export function llmUsageToBudget(usage: LlmUsage): Partial<BudgetUsage> {
  return {
    llmCalls: 1,
    inputTokens: usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens,
    outputTokens: usage.outputTokens,
    costUsd: usage.costUsd ?? 0,
  };
}

/** Hard ceilings for one task run. Exceeding any of them stops the run (never "just one more"). */
export interface BudgetLimits {
  maxLlmCalls: number;
  maxToolCalls: number;
  maxCostUsd: number;
}

export const DEFAULT_BUDGET_LIMITS: BudgetLimits = {
  maxLlmCalls: 40,
  maxToolCalls: 150,
  maxCostUsd: 5,
};

export class BudgetExceededError extends Error {
  constructor(
    readonly limit: keyof BudgetLimits,
    readonly usage: BudgetUsage,
  ) {
    super(`Task budget exceeded: ${limit}.`);
    this.name = 'BudgetExceededError';
  }
}

/**
 * Checked *before* spending: "would this next call cross a limit?". Checking afterwards would
 * let the call that breaks the budget run anyway.
 *
 * Calls on a model without a known price add 0 to `costUsd`; `maxLlmCalls` still bounds them.
 */
export function assertWithinBudget(
  current: BudgetUsage,
  limits: BudgetLimits,
  next: Partial<BudgetUsage>,
): void {
  const projected = addBudget(current, next);
  if (projected.llmCalls > limits.maxLlmCalls) {
    throw new BudgetExceededError('maxLlmCalls', current);
  }
  if (projected.toolCalls > limits.maxToolCalls) {
    throw new BudgetExceededError('maxToolCalls', current);
  }
  // Cost is only known after a call, so this catches the run once it has crossed the line.
  if (current.costUsd >= limits.maxCostUsd) {
    throw new BudgetExceededError('maxCostUsd', current);
  }
}
