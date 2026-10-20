import { MemorySaver } from '@langchain/langgraph';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Findings } from '../outputs/findings.js';
import { MemoryEventSink } from '../ports/events.port.js';
import { LlmProviderError, type LlmTurn } from '../ports/llm.port.js';
import { RunCancelledError, type RunStage, type StageGate } from '../ports/stage.port.js';
import { FakeLlmClient } from '../testing/fake-llm.client.js';
import { InMemoryWorkspace } from '../testing/in-memory-workspace.js';
import { buildAgentGraph } from './build-graph.js';

const plan = {
  goal: 'Fix empty cart',
  steps: [{ title: 'Find', detail: 'Find the cause' }],
  suspectedAreas: [],
  acceptanceCriteria: ['Empty cart works'],
};
const findings: Findings = {
  rootCause: 'Division by zero',
  evidence: [{ path: 'src/cart.ts', startLine: 1, endLine: 1, explanation: 'divides' }],
  filesToChange: ['src/cart.ts'],
  confidence: 'high',
};
const submitTurn: Omit<LlmTurn, 'usage'> = {
  stopReason: 'tool_use',
  text: '',
  toolCalls: [{ id: 't1', name: 'submit_findings', input: findings }],
  assistantMessage: { role: 'assistant', providerContent: [] },
};
const input = {
  taskId: 'task-1',
  runId: 'task-1',
  repository: { repositoryId: 'r1', owner: 'acme', name: 'shop', baseBranch: 'main' },
  baseCommitSha: 'a'.repeat(40),
  instruction: 'Fix the empty cart crash',
};

class RecordingGate implements StageGate {
  readonly entered: RunStage[] = [];
  cancelAt: RunStage | null = null;

  enter(stage: RunStage): Promise<void> {
    if (stage === this.cancelAt) return Promise.reject(new RunCancelledError());
    this.entered.push(stage);
    return Promise.resolve();
  }
}

describe('agent graph', () => {
  let llm: FakeLlmClient;
  let stages: RecordingGate;
  let checkpointer: MemorySaver;
  const config = { configurable: { thread_id: 'task-1' } };

  const build = () =>
    buildAgentGraph(
      {
        llm,
        events: new MemoryEventSink(),
        limits: { maxLlmCalls: 20, maxToolCalls: 40, maxCostUsd: 5 },
        workspace: new InMemoryWorkspace({ 'src/cart.ts': 'return sum / items.length;' }),
        stages,
      },
      checkpointer,
    );

  beforeEach(() => {
    llm = new FakeLlmClient();
    stages = new RecordingGate();
    checkpointer = new MemorySaver();
  });

  it('runs planner then investigator, entering each stage in order', async () => {
    llm.answer('planner', plan).turn('investigator', submitTurn);

    const final = await build().invoke(input, config);

    expect(final.plan).toEqual(plan);
    expect(final.findings).toEqual(findings);
    expect(stages.entered).toEqual(['planning', 'investigating']);
  });

  it('resumes after a crash without re-running (or re-paying for) completed nodes', async () => {
    llm
      .answer('planner', plan)
      .turn('investigator', new LlmProviderError(503, true)) // the worker "crashes" here
      .turn('investigator', submitTurn);

    await expect(build().invoke(input, config)).rejects.toBeInstanceOf(LlmProviderError);

    // A new graph instance, like a restarted worker process, sharing only the checkpoints.
    const final = await build().invoke(null, config);

    expect(final.findings).toEqual(findings);
    expect(llm.structuredRequests).toHaveLength(1); // the planner ran exactly once
    expect(final.budget.llmCalls).toBe(2); // planner + the successful investigator turn
    expect(stages.entered).toEqual(['planning', 'investigating', 'investigating']);
  });

  it('stops at the stage gate when the task is cancelled', async () => {
    llm.answer('planner', plan);
    stages.cancelAt = 'investigating';

    await expect(build().invoke(input, config)).rejects.toBeInstanceOf(RunCancelledError);
    expect(llm.turnRequests).toHaveLength(0); // the investigator never called the model
  });
});
