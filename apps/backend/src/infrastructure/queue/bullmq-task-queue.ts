import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

import { AppConfig } from '../../common/config/app-config.service.js';
import {
  AGENT_RUNS_QUEUE,
  RUN_START_JOB,
  type RunStartJob,
  runStartJobId,
  TaskQueue,
} from './task-queue.js';

/**
 * BullMQ adapter for the TaskQueue port (producer side; the Worker consumes in step 4.7).
 * The job carries only the task id: the worker reads everything else from the database, so a
 * job can never act on stale or forged data.
 */
@Injectable()
export class BullMqTaskQueue extends TaskQueue implements OnApplicationShutdown {
  private readonly queue: Queue<RunStartJob>;

  constructor(config: AppConfig) {
    super();
    this.queue = new Queue<RunStartJob>(AGENT_RUNS_QUEUE, {
      // BullMQ requires maxRetriesPerRequest: null. enableOfflineQueue: false makes the API
      // fail fast (and mark the task failed) instead of hanging while Redis is down.
      connection: new Redis(config.get('REDIS_URL'), {
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
      }),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    });
  }

  async enqueueRun(taskId: string): Promise<void> {
    await this.queue.add(RUN_START_JOB, { taskId }, { jobId: runStartJobId(taskId) });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}
