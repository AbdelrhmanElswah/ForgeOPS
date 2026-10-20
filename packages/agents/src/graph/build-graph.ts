import { type BaseCheckpointSaver, END, START, StateGraph } from '@langchain/langgraph';

import { createInvestigatorNode } from '../nodes/investigator.node.js';
import { createPlannerNode } from '../nodes/planner.node.js';
import type { BudgetLimits } from '../policies/budget.js';
import type { AgentEventSink } from '../ports/events.port.js';
import type { LlmClient } from '../ports/llm.port.js';
import type { RunStage, StageGate } from '../ports/stage.port.js';
import type { WorkspaceReader } from '../ports/workspace.port.js';
import { AgentState, type AgentStateUpdate, type AgentStateValue } from '../state/agent-state.js';
import { ToolExecutor } from '../tools/tool-executor.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { createWorkspaceReadTools } from '../tools/workspace-read.tools.js';

export interface AgentGraphDeps {
  llm: LlmClient;
  events: AgentEventSink;
  limits: BudgetLimits;
  workspace: WorkspaceReader;
  stages: StageGate;
  /** Repository settings `deniedPaths`. */
  extraDeniedPaths?: readonly string[];
  signal?: AbortSignal;
}

type Node = (state: AgentStateValue) => Promise<AgentStateUpdate>;

/**
 * The agent workflow (docs/ARCHITECTURE.md §6.1), compiled with a checkpointer so the state is
 * saved after every node. Re-invoking with the same `thread_id` after a crash resumes after the
 * last completed node instead of starting over (and paying for those LLM calls again).
 *
 * Current pipeline: planner → investigator. The implementer, verifier, reviewer and approval
 * gate are added in Phases 5 and 6.
 */
export function buildAgentGraph(deps: AgentGraphDeps, checkpointer?: BaseCheckpointSaver) {
  const registry = new ToolRegistry(createWorkspaceReadTools(deps.workspace));
  const executor = new ToolExecutor({
    registry,
    limits: deps.limits,
    events: deps.events,
    ...(deps.extraDeniedPaths && { extraDeniedPaths: deps.extraDeniedPaths }),
  });

  /** Runs the stage gate (status update + cancellation check) before the node itself. */
  const gated =
    (stage: RunStage, node: Node): Node =>
    async (state) => {
      await deps.stages.enter(stage);
      return node(state);
    };

  return new StateGraph(AgentState)
    .addNode('planner', gated('planning', createPlannerNode(deps)))
    .addNode(
      'investigator',
      gated('investigating', createInvestigatorNode({ ...deps, registry, executor })),
    )
    .addEdge(START, 'planner')
    .addEdge('planner', 'investigator')
    .addEdge('investigator', END)
    .compile(checkpointer ? { checkpointer } : {});
}

export type AgentGraph = ReturnType<typeof buildAgentGraph>;
