import {
  type AgentStateValue,
  type BudgetLimits,
  BudgetExceededError,
  buildAgentGraph,
  InvestigationIncompleteError,
  type LlmClient,
  LlmInvalidOutputError,
  LlmProviderError,
  LlmRefusalError,
  LlmTruncatedError,
  RunCancelledError,
  type RunStage,
  type StageGate,
} from '@forgeops/agents';
import {
  isTerminalStatus,
  RepositorySettingsSchema,
  type TaskFailureReason,
} from '@forgeops/contracts';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { AppConfig } from '../../../common/config/app-config.service.js';
import { NotFoundError } from '../../../common/errors/domain-error.js';
import { TaskEventsService } from '../../events/application/task-events.service.js';
import { GitHubAppClient } from '../../github/application/github-app.client.js';
import { RepositoriesRepository } from '../../repositories/application/repositories.repository.js';
import { TaskLifecycleService } from '../../tasks/application/task-lifecycle.service.js';
import { TasksRepository } from '../../tasks/application/tasks.repository.js';
import { InvalidStateTransitionError } from '../../tasks/domain/task-status.js';
import { RecordingEventSink } from '../infrastructure/recording-event-sink.js';
import { CHECKPOINTER, LLM_CLIENT } from '../orchestrator.tokens.js';
import {
  type OpenWorkspace,
  SandboxUnavailableError,
  WorkspaceFactory,
} from './workspace.factory.js';

/** How often a running task checks whether the user asked it to stop. */
export const CANCEL_POLL_MS = 3_000;

export type RunOutcome = 'skipped' | 'failed' | 'cancelled';

/**
 * Runs one task's agent graph and keeps the task's status truthful.
 *
 * Errors fall into two groups, and the difference matters:
 * - Permanent (budget, refusal, bad model output, missing sandbox, low confidence): retrying
 *   would fail the same way, so the task is marked failed with a precise reason and the job
 *   completes.
 * - Transient (network, rate limits, 5xx, unknown): rethrown, so BullMQ retries the job.
 *   The retry resumes from the last checkpoint: completed nodes are not run (or paid for) again.
 */
@Injectable()
export class AgentOrchestratorService {
  private readonly logger = new Logger(AgentOrchestratorService.name);

  constructor(
    private readonly tasks: TasksRepository,
    private readonly lifecycle: TaskLifecycleService,
    private readonly repositories: RepositoriesRepository,
    private readonly github: GitHubAppClient,
    private readonly workspaces: WorkspaceFactory,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
    @Inject(CHECKPOINTER) private readonly checkpointer: BaseCheckpointSaver,
    private readonly events: TaskEventsService,
    private readonly config: AppConfig,
  ) {}

  async run(taskId: string): Promise<RunOutcome> {
    const task = await this.tasks.findById(taskId);
    if (!task || isTerminalStatus(task.status)) {
      return 'skipped'; // a duplicate or late job: nothing to do
    }
    if (task.cancelRequestedAt) {
      return this.cancel(taskId);
    }
    const repository = await this.repositories.findForWorker(task.repositoryId);
    if (!repository) {
      return this.fail(taskId, 'github_error', 'The repository is no longer connected.');
    }

    let baseCommitSha = task.baseCommitSha;
    if (task.status === 'queued') {
      try {
        // Pin the exact commit now: every later step works against the same code.
        baseCommitSha = await this.github.getBranchHead(
          repository.githubInstallationId,
          repository.owner,
          repository.name,
          task.baseBranch,
        );
      } catch (error) {
        if (error instanceof NotFoundError) {
          return this.fail(taskId, 'github_error', `Branch "${task.baseBranch}" was not found.`);
        }
        throw error; // GitHub outage: retry the job
      }
      await this.lifecycle.transition(taskId, 'planning', { startedAt: new Date(), baseCommitSha });
    }
    if (!baseCommitSha) {
      return this.fail(taskId, 'internal_error', 'The task has no pinned base commit.');
    }

    const controller = new AbortController();
    const poll = setInterval(() => {
      void this.abortIfCancelRequested(taskId, controller);
    }, CANCEL_POLL_MS);
    let workspace: OpenWorkspace | undefined;

    try {
      workspace = await this.workspaces.open({ taskId, repository, commitSha: baseCommitSha });
      const graph = buildAgentGraph(
        {
          llm: this.llm,
          events: new RecordingEventSink(taskId, this.events),
          limits: this.limits(),
          workspace: workspace.reader,
          stages: this.stageGate(taskId),
          extraDeniedPaths: RepositorySettingsSchema.parse(repository.settings).deniedPaths,
          signal: controller.signal,
        },
        this.checkpointer,
      );
      const config = { configurable: { thread_id: taskId }, signal: controller.signal };
      const resuming = (await this.checkpointer.getTuple(config)) !== undefined;
      if (resuming) {
        this.logger.log({ taskId }, 'Resuming task from its last checkpoint');
      }
      const final = await graph.invoke(
        resuming
          ? null
          : {
              taskId,
              runId: taskId,
              repository: {
                repositoryId: repository.id,
                owner: repository.owner,
                name: repository.name,
                baseBranch: task.baseBranch,
              },
              baseCommitSha,
              instruction: task.instruction,
            },
        config,
      );
      return await this.complete(taskId, final);
    } catch (error) {
      return await this.handleFailure(taskId, error, controller.signal);
    } finally {
      clearInterval(poll);
      await workspace?.close().catch((error: unknown) => {
        this.logger.warn({ err: error, taskId }, 'Could not close workspace');
      });
    }
  }

  /** The graph currently ends after investigation; Phase 5 continues to implementation. */
  private complete(taskId: string, final: AgentStateValue): Promise<RunOutcome> {
    if (!final.findings || final.findings.confidence === 'low') {
      return this.fail(
        taskId,
        'needs_human',
        final.findings
          ? `Low-confidence findings: ${final.findings.rootCause}`.slice(0, 1_000)
          : 'The investigation produced no findings.',
      );
    }
    return this.fail(
      taskId,
      'internal_error',
      'Investigation finished, but the implementation stage is not built yet (roadmap Phase 5).',
    );
  }

  private async handleFailure(
    taskId: string,
    error: unknown,
    signal: AbortSignal,
  ): Promise<RunOutcome> {
    if (error instanceof RunCancelledError || signal.aborted) {
      return this.cancel(taskId);
    }
    if (error instanceof InvalidStateTransitionError) {
      return 'skipped'; // someone else (a cancel) already moved the task to a final state
    }
    if (error instanceof BudgetExceededError) {
      return this.fail(taskId, 'budget_exceeded', `Budget limit reached: ${error.limit}.`);
    }
    if (error instanceof LlmRefusalError) {
      return this.fail(taskId, 'model_refused', error.message);
    }
    if (
      error instanceof LlmInvalidOutputError ||
      error instanceof LlmTruncatedError ||
      error instanceof InvestigationIncompleteError
    ) {
      return this.fail(taskId, 'invalid_llm_output', error.message);
    }
    if (error instanceof LlmProviderError && !error.retryable) {
      return this.fail(taskId, 'internal_error', error.message);
    }
    if (error instanceof SandboxUnavailableError) {
      return this.fail(taskId, 'sandbox_error', error.message);
    }
    throw error; // transient or unknown: let the queue retry from the last checkpoint
  }

  private stageGate(taskId: string): StageGate {
    return {
      enter: async (stage: RunStage) => {
        const task = await this.tasks.findById(taskId);
        if (!task || task.cancelRequestedAt) {
          throw new RunCancelledError();
        }
        if (task.status !== stage) {
          await this.lifecycle.transition(taskId, stage);
        }
      },
    };
  }

  private async abortIfCancelRequested(taskId: string, controller: AbortController) {
    const task = await this.tasks.findById(taskId).catch(() => null);
    if (task?.cancelRequestedAt && !controller.signal.aborted) {
      controller.abort(new RunCancelledError());
    }
  }

  private async cancel(taskId: string): Promise<RunOutcome> {
    await this.lifecycle.transition(taskId, 'cancelled').catch(this.ignoreIfAlreadyFinal);
    return 'cancelled';
  }

  private async fail(
    taskId: string,
    failureReason: TaskFailureReason,
    failureDetail: string,
  ): Promise<RunOutcome> {
    this.logger.warn({ taskId, failureReason, failureDetail }, 'Task failed');
    await this.lifecycle
      .transition(taskId, 'failed', { failureReason, failureDetail })
      .catch(this.ignoreIfAlreadyFinal);
    return 'failed';
  }

  /** A concurrent cancel may have finished the task first; that outcome stands. */
  private readonly ignoreIfAlreadyFinal = (error: unknown): void => {
    if (!(error instanceof InvalidStateTransitionError)) throw error;
  };

  private limits(): BudgetLimits {
    return {
      maxCostUsd: this.config.get('TASK_MAX_COST_USD'),
      maxLlmCalls: this.config.get('TASK_MAX_LLM_CALLS'),
      maxToolCalls: this.config.get('TASK_MAX_TOOL_CALLS'),
    };
  }
}
