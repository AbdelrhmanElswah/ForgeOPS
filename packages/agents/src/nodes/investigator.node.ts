import { performance } from 'node:perf_hooks';

import { type Findings, FindingsSchema } from '../outputs/findings.js';
import { type BudgetLimits, assertWithinBudget } from '../policies/budget.js';
import { PathGuard } from '../policies/path-guard.js';
import {
  INVESTIGATOR_SYSTEM_PROMPT,
  investigatorUserMessage,
  SUBMIT_FINDINGS_TOOL,
} from '../prompts/investigator.prompt.js';
import type { AgentEventSink } from '../ports/events.port.js';
import type { LlmClient, LlmMessage, LlmToolCall, LlmUserContent } from '../ports/llm.port.js';
import type { WorkspaceReader } from '../ports/workspace.port.js';
import type { AgentStateUpdate, AgentStateValue } from '../state/agent-state.js';
import type { ToolExecutor } from '../tools/tool-executor.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import { findEvidenceProblems } from './evidence.js';
import { NodeSpend } from './node-spend.js';

export const DEFAULT_INVESTIGATOR_MAX_TURNS = 20;

export class InvestigationIncompleteError extends Error {
  constructor(readonly reason: 'no_findings' | 'turn_limit') {
    super(
      reason === 'turn_limit'
        ? 'The investigation reached its turn limit without submitting findings.'
        : 'The investigation ended without submitting findings.',
    );
    this.name = 'InvestigationIncompleteError';
  }
}

export interface InvestigatorNodeDeps {
  llm: LlmClient;
  events: AgentEventSink;
  limits: BudgetLimits;
  registry: ToolRegistry;
  executor: ToolExecutor;
  workspace: WorkspaceReader;
  extraDeniedPaths?: readonly string[];
  maxTurns?: number;
  signal?: AbortSignal;
}

type ToolResult = Extract<LlmUserContent, { type: 'tool_result' }>;

/**
 * Graph node: plan → evidence-backed Findings, through a bounded tool loop.
 *
 *   model turn → tool calls (each through the ToolExecutor policy chain) → results → …
 *   … until the model calls submit_findings with evidence that checks out against the files.
 *
 * Forced tool choice isn't available on current models, so the loop ends through a tool whose
 * input *is* the output schema; a model that stops without it gets one reminder.
 */
export function createInvestigatorNode(deps: InvestigatorNodeDeps) {
  const guard = new PathGuard(deps.extraDeniedPaths);
  const maxTurns = deps.maxTurns ?? DEFAULT_INVESTIGATOR_MAX_TURNS;
  const submitTool = {
    name: SUBMIT_FINDINGS_TOOL,
    description: 'Submit the investigation result. Call exactly once, when you are done.',
    input: FindingsSchema,
  };

  return async (state: AgentStateValue): Promise<AgentStateUpdate> => {
    if (!state.plan) {
      throw new Error('The investigator needs a plan: run the planner first.');
    }
    const startedAt = performance.now();
    await deps.events.emit({ type: 'node.started', node: 'investigator' });
    const spend = new NodeSpend('investigator', state.budget, deps.events);
    const tools = [...deps.registry.definitionsFor('investigator'), submitTool];

    const messages: LlmMessage[] = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: investigatorUserMessage({
              instruction: state.instruction,
              owner: state.repository.owner,
              name: state.repository.name,
              plan: state.plan,
            }),
          },
        ],
      },
    ];
    let reminded = false;

    for (let turn = 1; turn <= maxTurns; turn++) {
      assertWithinBudget(spend.total, deps.limits, { llmCalls: 1 });
      const response = await deps.llm.respond({
        role: 'investigator',
        system: INVESTIGATOR_SYSTEM_PROMPT,
        messages,
        tools,
        ...(deps.signal && { signal: deps.signal }),
      });
      await spend.recordLlm(response.usage);
      messages.push(response.assistantMessage);

      if (response.toolCalls.length === 0) {
        if (response.stopReason === 'pause_turn') continue;
        if (reminded) throw new InvestigationIncompleteError('no_findings');
        reminded = true;
        messages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Call ${SUBMIT_FINDINGS_TOOL} now with what you have found (use low confidence if unsure).`,
            },
          ],
        });
        continue;
      }

      // All results of one turn go back together, in a single message.
      const results: ToolResult[] = [];
      let findings: Findings | null = null;
      for (const call of response.toolCalls) {
        if (call.name === SUBMIT_FINDINGS_TOOL) {
          const submitted = await submit(call);
          results.push(submitted.result);
          findings ??= submitted.findings;
        } else {
          const outcome = await deps.executor.execute(call, {
            role: 'investigator',
            budget: spend.total,
            ...(deps.signal && { signal: deps.signal }),
          });
          spend.add(outcome.budgetDelta);
          results.push(outcome.result);
        }
      }

      if (findings) {
        await deps.events.emit({
          type: 'node.completed',
          node: 'investigator',
          durationMs: Math.round(performance.now() - startedAt),
        });
        return { findings, budget: spend.spent };
      }
      messages.push({ role: 'user', content: results });
    }
    throw new InvestigationIncompleteError('turn_limit');

    async function submit(
      call: LlmToolCall,
    ): Promise<{ result: ToolResult; findings: Findings | null }> {
      assertWithinBudget(spend.total, deps.limits, { toolCalls: 1 });
      spend.add({ toolCalls: 1 });
      const startedAt = performance.now();

      const parsed = FindingsSchema.safeParse(call.input);
      const problems = parsed.success
        ? await findEvidenceProblems(parsed.data, deps.workspace, guard)
        : parsed.error.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`);

      await deps.events.emit({
        type: 'tool.called',
        role: 'investigator',
        tool: SUBMIT_FINDINGS_TOOL,
        ok: problems.length === 0,
        durationMs: Math.round(performance.now() - startedAt),
        ...(problems.length > 0 && { error: problems.join('; ').slice(0, 200) }),
      });

      if (!parsed.success || problems.length > 0) {
        return {
          result: {
            type: 'tool_result',
            toolCallId: call.id,
            isError: true,
            content: `Findings rejected. Fix these and call ${SUBMIT_FINDINGS_TOOL} again:\n- ${problems.join('\n- ')}`,
          },
          findings: null,
        };
      }
      return {
        result: { type: 'tool_result', toolCallId: call.id, content: 'Findings recorded.' },
        findings: parsed.data,
      };
    }
  };
}
