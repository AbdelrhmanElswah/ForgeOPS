import { performance } from 'node:perf_hooks';

import { PlanSchema } from '../outputs/plan.js';
import { type BudgetLimits, assertWithinBudget } from '../policies/budget.js';
import { PLANNER_SYSTEM_PROMPT, plannerUserMessage } from '../prompts/planner.prompt.js';
import type { AgentEventSink } from '../ports/events.port.js';
import { type LlmClient, LlmError, LlmInvalidOutputError } from '../ports/llm.port.js';
import type { AgentStateUpdate, AgentStateValue } from '../state/agent-state.js';
import { NodeSpend } from './node-spend.js';

/** One retry for malformed output; a second failure is a real problem, not bad luck. */
const MAX_ATTEMPTS = 2;

export interface PlannerNodeDeps {
  llm: LlmClient;
  events: AgentEventSink;
  limits: BudgetLimits;
  signal?: AbortSignal;
}

/**
 * Graph node: instruction → validated Plan.
 *
 * Built as a factory so dependencies arrive through ports (no globals, nothing to mock at the
 * module level), and the same node runs against Claude in production and FakeLlmClient in tests.
 */
export function createPlannerNode(deps: PlannerNodeDeps) {
  return async (state: AgentStateValue): Promise<AgentStateUpdate> => {
    const startedAt = performance.now();
    await deps.events.emit({ type: 'node.started', node: 'planner' });

    const spend = new NodeSpend('planner', state.budget, deps.events);

    for (let attempt = 1; ; attempt++) {
      assertWithinBudget(spend.total, deps.limits, { llmCalls: 1 });
      try {
        const { output, usage } = await deps.llm.generateStructured({
          role: 'planner',
          system: PLANNER_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: plannerUserMessage({
                    instruction: state.instruction,
                    owner: state.repository.owner,
                    name: state.repository.name,
                    baseBranch: state.repository.baseBranch,
                    baseCommitSha: state.baseCommitSha,
                  }),
                },
              ],
            },
          ],
          schema: PlanSchema,
          ...(deps.signal && { signal: deps.signal }),
        });
        await spend.recordLlm(usage);
        await deps.events.emit({
          type: 'node.completed',
          node: 'planner',
          durationMs: Math.round(performance.now() - startedAt),
        });
        return { plan: output, budget: spend.spent };
      } catch (error) {
        if (error instanceof LlmError && error.usage) {
          await spend.recordLlm(error.usage);
        }
        if (error instanceof LlmInvalidOutputError && attempt < MAX_ATTEMPTS) {
          continue;
        }
        throw error;
      }
    }
  };
}
