import { Annotation } from '@langchain/langgraph';

import type { Findings } from '../outputs/findings.js';
import type { Plan } from '../outputs/plan.js';

export interface RepoRef {
  repositoryId: string;
  owner: string;
  name: string;
  baseBranch: string;
}

/** Running totals for a task. Every LLM and tool call adds to it; budgets are checked against it. */
export interface BudgetUsage {
  llmCalls: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export const EMPTY_BUDGET: BudgetUsage = {
  llmCalls: 0,
  toolCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
};

export function addBudget(a: BudgetUsage, b: Partial<BudgetUsage>): BudgetUsage {
  return {
    llmCalls: a.llmCalls + (b.llmCalls ?? 0),
    toolCalls: a.toolCalls + (b.toolCalls ?? 0),
    inputTokens: a.inputTokens + (b.inputTokens ?? 0),
    outputTokens: a.outputTokens + (b.outputTokens ?? 0),
    costUsd: a.costUsd + (b.costUsd ?? 0),
  };
}

/**
 * The state LangGraph checkpoints after every node (docs/ARCHITECTURE.md §6.2).
 *
 * Rules: it must stay small and serialisable, and it never holds secrets (tokens, API keys)
 * or large blobs (file contents, diffs, logs). Those live in the artifact store; the state
 * keeps only their ids. A checkpoint is written to Postgres on every step, so anything here
 * is stored many times over.
 */
export const AgentState = Annotation.Root({
  taskId: Annotation<string>(),
  runId: Annotation<string>(),
  repository: Annotation<RepoRef>(),
  baseCommitSha: Annotation<string>(),
  instruction: Annotation<string>(),

  plan: Annotation<Plan | null>({ reducer: (_, next) => next, default: () => null }),
  findings: Annotation<Findings | null>({ reducer: (_, next) => next, default: () => null }),
  changedFiles: Annotation<string[]>({
    reducer: (current, next) => [...new Set([...current, ...next])],
    default: () => [],
  }),
  diffArtifactId: Annotation<string | null>({ reducer: (_, next) => next, default: () => null }),
  diffHash: Annotation<string | null>({ reducer: (_, next) => next, default: () => null }),
  retryCount: Annotation<number>({ reducer: (_, next) => next, default: () => 0 }),

  /** Nodes return the *delta* they spent; the reducer accumulates it. */
  budget: Annotation<BudgetUsage, Partial<BudgetUsage>>({
    reducer: addBudget,
    default: () => EMPTY_BUDGET,
  }),
});

export type AgentStateValue = typeof AgentState.State;
export type AgentStateUpdate = typeof AgentState.Update;
