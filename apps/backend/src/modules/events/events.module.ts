import { Module } from '@nestjs/common';

import { TaskEventBus, TaskEventStore } from './application/event-ports.js';
import { TaskEventsService } from './application/task-events.service.js';
import { PrismaTaskEventStore } from './infrastructure/prisma-task-event.store.js';
import { RedisTaskEventBus } from './infrastructure/redis-task-event.bus.js';

/** Shared by both processes: the Worker records events, the API streams them. */
@Module({
  providers: [
    TaskEventsService,
    { provide: TaskEventStore, useClass: PrismaTaskEventStore },
    { provide: TaskEventBus, useClass: RedisTaskEventBus },
  ],
  exports: [TaskEventsService],
})
export class EventsModule {}
