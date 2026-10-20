import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type Job, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { z } from 'zod';

import { AppConfig } from '../../../common/config/app-config.service.js';
import {
  AGENT_RUNS_QUEUE,
  RUN_START_JOB,
  type RunStartJob,
} from '../../../infrastructure/queue/task-queue.js';
import { TaskLifecycleService } from '../../tasks/application/task-lifecycle.service.js';
import {
  AgentOrchestratorService,
  type RunOutcome,
} from '../application/agent-orchestrator.service.js';

const RunStartJobSchema = z.object({ taskId: z.uuid() });

/**
 * BullMQ consumer in the Worker process. Concurrency bounds how many graphs run at once;
 * `close()` on shutdown waits for in-flight jobs, so `docker stop` doesn't cut a run in half
 * (and if the process is killed anyway, the job is retried from its last checkpoint).
 */
@Injectable()
export class AgentRunProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AgentRunProcessor.name);
  private worker?: Worker<RunStartJob, RunOutcome>;

  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    private readonly lifecycle: TaskLifecycleService,
    private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    this.worker = new Worker<RunStartJob, RunOutcome>(
      AGENT_RUNS_QUEUE,
      (job) => this.process(job),
      {
        connection: new Redis(this.config.get('REDIS_URL'), { maxRetriesPerRequest: null }),
        concurrency: this.config.get('WORKER_CONCURRENCY'),
      },
    );
    this.worker.on('failed', (job, error) => {
      void this.onFailed(job, error);
    });
    this.logger.log(
      `Consuming "${AGENT_RUNS_QUEUE}" (concurrency ${String(this.config.get('WORKER_CONCURRENCY'))})`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }

  private process(job: Job<RunStartJob>): Promise<RunOutcome> {
    if (job.name !== RUN_START_JOB) {
      throw new Error(`Unknown job "${job.name}"`);
    }
    // The payload crossed a process boundary: validate it like any other input.
    const { taskId } = RunStartJobSchema.parse(job.data);
    return this.orchestrator.run(taskId);
  }

  /** After the last retry, the task must not stay "running" forever. */
  private async onFailed(job: Job<RunStartJob> | undefined, error: Error): Promise<void> {
    if (!job) return;
    const finalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
    this.logger.error(
      { err: error, jobId: job.id, attempt: job.attemptsMade, finalAttempt },
      'Agent run failed',
    );
    if (!finalAttempt) return;
    await this.lifecycle
      .transition(job.data.taskId, 'failed', {
        failureReason: 'internal_error',
        failureDetail: 'The run kept failing after several attempts.',
      })
      .catch((cleanupError: unknown) => {
        this.logger.warn({ err: cleanupError, jobId: job.id }, 'Could not mark task failed');
      });
  }
}
