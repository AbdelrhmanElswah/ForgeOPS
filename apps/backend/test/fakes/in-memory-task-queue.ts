import { runStartJobId, TaskQueue } from '../../src/infrastructure/queue/task-queue.js';

/** Records enqueued jobs, deduplicated by job id like BullMQ. Set `failNext` to simulate Redis being down. */
export class InMemoryTaskQueue extends TaskQueue {
  readonly jobIds: string[] = [];
  failNext = false;

  enqueueRun(taskId: string): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('Connection is closed.'));
    }
    const jobId = runStartJobId(taskId);
    if (!this.jobIds.includes(jobId)) this.jobIds.push(jobId);
    return Promise.resolve();
  }
}
