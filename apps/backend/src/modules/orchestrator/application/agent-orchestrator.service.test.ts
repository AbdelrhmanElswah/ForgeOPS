import {
  type Findings,
  LlmInvalidOutputError,
  LlmProviderError,
  LlmRefusalError,
  type LlmTurn,
} from '@forgeops/agents';
import { FAKE_USAGE, FakeLlmClient, InMemoryWorkspace } from '@forgeops/agents/testing';
import { MemorySaver } from '@langchain/langgraph';
import { beforeEach, describe, expect, it } from 'vitest';

import { FakeGitHubAppClient } from '../../../../test/fakes/fake-github-app.client.js';
import { InMemoryInstallationsRepository } from '../../../../test/fakes/in-memory-installations.repository.js';
import { InMemoryRepositoriesRepository } from '../../../../test/fakes/in-memory-repositories.repository.js';
import { InMemoryTasksRepository } from '../../../../test/fakes/in-memory-tasks.repository.js';
import type { AppConfig } from '../../../common/config/app-config.service.js';
import { NotFoundError } from '../../../common/errors/domain-error.js';
import { TaskLifecycleService } from '../../tasks/application/task-lifecycle.service.js';
import { UnavailableWorkspaceFactory } from '../infrastructure/unavailable-workspace.factory.js';
import { AgentOrchestratorService } from './agent-orchestrator.service.js';
import { type OpenWorkspace, WorkspaceFactory } from './workspace.factory.js';

const SHA = 'c'.repeat(40);
const plan = {
  goal: 'Fix empty cart',
  steps: [{ title: 'Find', detail: 'Find the cause' }],
  suspectedAreas: [],
  acceptanceCriteria: ['Empty cart works'],
};
const findings = (confidence: Findings['confidence']): Findings => ({
  rootCause: 'averagePrice divides by zero for an empty cart',
  evidence: [{ path: 'src/cart.ts', startLine: 1, endLine: 1, explanation: 'divides' }],
  filesToChange: ['src/cart.ts'],
  confidence,
});
const submit = (confidence: Findings['confidence']): Omit<LlmTurn, 'usage'> => ({
  stopReason: 'tool_use',
  text: '',
  toolCalls: [{ id: 't1', name: 'submit_findings', input: findings(confidence) }],
  assistantMessage: { role: 'assistant', providerContent: [] },
});

class FakeWorkspaces extends WorkspaceFactory {
  opened = 0;
  closed = 0;
  open(): Promise<OpenWorkspace> {
    this.opened++;
    return Promise.resolve({
      reader: new InMemoryWorkspace({ 'src/cart.ts': 'return sum / items.length;' }),
      close: () => {
        this.closed++;
        return Promise.resolve();
      },
    });
  }
}

describe('AgentOrchestratorService', () => {
  let tasks: InMemoryTasksRepository;
  let llm: FakeLlmClient;
  let github: FakeGitHubAppClient;
  let workspaces: WorkspaceFactory;
  let checkpointer: MemorySaver;
  let repositoryId: string;
  let config: Record<string, number | string>;

  function orchestrator() {
    const installations = new InMemoryInstallationsRepository();
    const repositories = new InMemoryRepositoriesRepository(installations);
    void installations.saveForUser('user-1', github.snapshot(1), new Date());
    repositoryId = [...installations.repositories.values()][0]?.id ?? '';
    return new AgentOrchestratorService(
      tasks,
      new TaskLifecycleService(tasks),
      repositories,
      github,
      workspaces,
      llm,
      checkpointer,
      { get: (key: string) => config[key] } as unknown as AppConfig,
    );
  }

  async function queuedTask(service = orchestrator()) {
    const task = await tasks.create({
      userId: 'user-1',
      repositoryId,
      instruction: 'Checkout crashes on an empty cart; fix it.',
      baseBranch: 'main',
    });
    return { service, taskId: task.id };
  }

  const stored = (taskId: string) => tasks.rows.get(taskId);

  beforeEach(() => {
    tasks = new InMemoryTasksRepository();
    llm = new FakeLlmClient();
    github = new FakeGitHubAppClient();
    github.addInstallation(1, 'acme', [11]);
    github.getBranchHead = () => Promise.resolve(SHA);
    workspaces = new FakeWorkspaces();
    checkpointer = new MemorySaver();
    config = { TASK_MAX_COST_USD: 5, TASK_MAX_LLM_CALLS: 20, TASK_MAX_TOOL_CALLS: 40 };
  });

  it('pins the commit, walks the stages, and closes the workspace', async () => {
    const { service, taskId } = await queuedTask();
    const seen: string[] = [];
    llm
      .answer('planner', () => {
        seen.push(stored(taskId)?.status ?? '');
        return plan;
      })
      .turn('investigator', () => {
        seen.push(stored(taskId)?.status ?? '');
        return submit('high');
      });

    await service.run(taskId);

    expect(seen).toEqual(['planning', 'investigating']);
    expect(stored(taskId)).toMatchObject({
      baseCommitSha: SHA,
      startedAt: expect.any(Date) as Date,
    });
    expect((workspaces as FakeWorkspaces).closed).toBe(1);
  });

  it('ends confident investigations honestly until the implementer exists (Phase 5)', async () => {
    const { service, taskId } = await queuedTask();
    llm.answer('planner', plan).turn('investigator', submit('high'));

    await expect(service.run(taskId)).resolves.toBe('failed');

    expect(stored(taskId)).toMatchObject({
      status: 'failed',
      failureReason: 'internal_error',
      failureDetail: expect.stringContaining('Phase 5') as string,
    });
  });

  it('hands low-confidence findings to a human instead of attempting a fix', async () => {
    const { service, taskId } = await queuedTask();
    llm.answer('planner', plan).turn('investigator', submit('low'));

    await service.run(taskId);

    expect(stored(taskId)).toMatchObject({ status: 'failed', failureReason: 'needs_human' });
  });

  describe('permanent failures get a precise reason (no retry)', () => {
    it('budget exhausted', async () => {
      config.TASK_MAX_LLM_CALLS = 1; // the planner uses it; the investigator may not call
      const { service, taskId } = await queuedTask();
      llm.answer('planner', plan);

      await expect(service.run(taskId)).resolves.toBe('failed');
      expect(stored(taskId)?.failureReason).toBe('budget_exceeded');
    });

    it('model refusal', async () => {
      const { service, taskId } = await queuedTask();
      llm.answer('planner', new LlmRefusalError('cyber', FAKE_USAGE));

      await service.run(taskId);
      expect(stored(taskId)?.failureReason).toBe('model_refused');
    });

    it('invalid model output after the retry', async () => {
      const { service, taskId } = await queuedTask();
      llm
        .answer('planner', new LlmInvalidOutputError(FAKE_USAGE))
        .answer('planner', new LlmInvalidOutputError(FAKE_USAGE));

      await service.run(taskId);
      expect(stored(taskId)?.failureReason).toBe('invalid_llm_output');
    });

    it('provider rejecting the request (e.g. bad credentials)', async () => {
      const { service, taskId } = await queuedTask();
      llm.answer('planner', new LlmProviderError(401, false));

      await service.run(taskId);
      expect(stored(taskId)?.failureReason).toBe('internal_error');
    });

    it('no sandbox available', async () => {
      workspaces = new UnavailableWorkspaceFactory();
      const { service, taskId } = await queuedTask();

      await service.run(taskId);
      expect(stored(taskId)?.failureReason).toBe('sandbox_error');
    });

    it('base branch deleted', async () => {
      github.getBranchHead = () => Promise.reject(new NotFoundError('GitHub resource'));
      const { service, taskId } = await queuedTask();

      await service.run(taskId);
      expect(stored(taskId)).toMatchObject({ failureReason: 'github_error', status: 'failed' });
    });
  });

  it('rethrows transient failures, and the retry resumes from the checkpoint', async () => {
    const { service, taskId } = await queuedTask();
    llm
      .answer('planner', plan)
      .turn('investigator', new LlmProviderError(529, true))
      .turn('investigator', submit('low'));

    await expect(service.run(taskId)).rejects.toBeInstanceOf(LlmProviderError);
    expect(stored(taskId)?.status).toBe('investigating'); // not failed: it will be retried

    await service.run(taskId); // BullMQ's retry

    expect(llm.structuredRequests).toHaveLength(1); // the planner was not re-run (or re-paid)
    expect(stored(taskId)?.failureReason).toBe('needs_human');
  });

  describe('cancellation', () => {
    it('cancels before doing any work', async () => {
      const { service, taskId } = await queuedTask();
      await tasks.requestCancel(taskId, new Date());

      await expect(service.run(taskId)).resolves.toBe('cancelled');
      expect(stored(taskId)?.status).toBe('cancelled');
      expect(llm.structuredRequests).toHaveLength(0);
    });

    it('stops at the next stage when cancelled mid-run', async () => {
      const { service, taskId } = await queuedTask();
      llm.answer('planner', () => {
        void tasks.requestCancel(taskId, new Date()); // the user clicks cancel during planning
        return plan;
      });

      await expect(service.run(taskId)).resolves.toBe('cancelled');
      expect(llm.turnRequests).toHaveLength(0); // the investigator never started
    });
  });

  it('ignores a job for a task that already finished', async () => {
    const { service, taskId } = await queuedTask();
    Object.assign(stored(taskId) ?? {}, { status: 'completed' });

    await expect(service.run(taskId)).resolves.toBe('skipped');
  });
});
