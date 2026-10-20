import { Module } from '@nestjs/common';

import { IdempotencyInterceptor } from '../../common/http/idempotency.interceptor.js';
import { QueueModule } from '../../infrastructure/queue/queue.module.js';
import { RepositoriesModule } from '../repositories/repositories.module.js';
import { CancelTaskUseCase } from './application/cancel-task.use-case.js';
import { CreateTaskUseCase } from './application/create-task.use-case.js';
import { TaskLifecycleService } from './application/task-lifecycle.service.js';
import { TaskQueries } from './application/task.queries.js';
import { TasksRepository } from './application/tasks.repository.js';
import { TasksController } from './http/tasks.controller.js';
import { PrismaTasksRepository } from './infrastructure/prisma-tasks.repository.js';

@Module({
  imports: [QueueModule, RepositoriesModule],
  controllers: [TasksController],
  providers: [
    CreateTaskUseCase,
    CancelTaskUseCase,
    TaskQueries,
    TaskLifecycleService,
    IdempotencyInterceptor,
    { provide: TasksRepository, useClass: PrismaTasksRepository },
  ],
  // The Worker (step 4.7) drives status changes through the lifecycle service.
  exports: [TaskLifecycleService, TasksRepository],
})
export class TasksModule {}
