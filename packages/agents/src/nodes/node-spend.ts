import { llmUsageToBudget } from '../policies/budget.js';
import type { AgentEventSink } from '../ports/events.port.js';
import type { LlmUsage } from '../ports/llm.port.js';
import type { AgentRole } from '../roles.js';
import { addBudget, type BudgetUsage, EMPTY_BUDGET } from '../state/agent-state.js';

/**
 * What one node run spends. The node returns `spent` as its budget *delta* (the state reducer
 * adds it to the task total); `total` is what budget checks must look at mid-node.
 */
export class NodeSpend {
  private delta: BudgetUsage = EMPTY_BUDGET;

  constructor(
    private readonly role: AgentRole,
    private readonly before: BudgetUsage,
    private readonly events: AgentEventSink,
  ) {}

  get spent(): BudgetUsage {
    return this.delta;
  }

  /** Task total so far, including this node's spending. */
  get total(): BudgetUsage {
    return addBudget(this.before, this.delta);
  }

  async recordLlm(usage: LlmUsage): Promise<void> {
    this.delta = addBudget(this.delta, llmUsageToBudget(usage));
    await this.events.emit({
      type: 'llm.called',
      role: this.role,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.costUsd,
    });
  }

  add(delta: Partial<BudgetUsage>): void {
    this.delta = addBudget(this.delta, delta);
  }
}
