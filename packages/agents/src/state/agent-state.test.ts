import { END, START, StateGraph } from '@langchain/langgraph';
import { describe, expect, it } from 'vitest';

import { AgentState } from './agent-state.js';

const initial = {
  taskId: 'task-1',
  runId: 'run-1',
  repository: { repositoryId: 'repo-1', owner: 'acme', name: 'shop', baseBranch: 'main' },
  baseCommitSha: 'a'.repeat(40),
  instruction: 'Fix the checkout bug',
};

describe('AgentState reducers', () => {
  it('accumulates budget deltas and de-duplicates changed files across nodes', async () => {
    const graph = new StateGraph(AgentState)
      .addNode('first', () => ({
        budget: { llmCalls: 1, inputTokens: 100, costUsd: 0.01 },
        changedFiles: ['src/a.ts'],
      }))
      .addNode('second', () => ({
        budget: { llmCalls: 1, toolCalls: 3, inputTokens: 50, costUsd: 0.02 },
        changedFiles: ['src/a.ts', 'src/b.ts'],
      }))
      .addEdge(START, 'first')
      .addEdge('first', 'second')
      .addEdge('second', END)
      .compile();

    const final = await graph.invoke(initial);

    expect(final.budget).toEqual({
      llmCalls: 2,
      toolCalls: 3,
      inputTokens: 150,
      outputTokens: 0,
      costUsd: expect.closeTo(0.03, 10) as number,
    });
    expect(final.changedFiles).toEqual(['src/a.ts', 'src/b.ts']);
    expect(final.plan).toBeNull(); // defaults apply to fields no node wrote
  });
});
