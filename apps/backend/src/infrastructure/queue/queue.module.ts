import { Module } from '@nestjs/common';

import { BullMqTaskQueue } from './bullmq-task-queue.js';
import { TaskQueue } from './task-queue.js';

@Module({
  providers: [{ provide: TaskQueue, useClass: BullMqTaskQueue }],
  exports: [TaskQueue],
})
export class QueueModule {}
