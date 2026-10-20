import { type TaskEvent, TaskEventSchema } from '@forgeops/contracts';
import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { REDIS_CLIENT } from '../../../infrastructure/redis/redis.constants.js';
import { TaskEventBus } from '../application/event-ports.js';

const channel = (taskId: string) => `task-events:${taskId}`;

/**
 * Redis pub/sub adapter. A subscribed Redis connection can do nothing else, so subscriptions
 * share one dedicated connection (created on first use: the Worker only publishes and never
 * opens it). Handlers are reference-counted per channel.
 */
@Injectable()
export class RedisTaskEventBus extends TaskEventBus implements OnModuleDestroy {
  private readonly logger = new Logger(RedisTaskEventBus.name);
  private subscriber: Redis | undefined;
  private readonly handlers = new Map<string, Set<(event: TaskEvent) => void>>();

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    super();
  }

  async publish(event: TaskEvent): Promise<void> {
    await this.redis.publish(channel(event.taskId), JSON.stringify(event));
  }

  async subscribe(
    taskId: string,
    handler: (event: TaskEvent) => void,
  ): Promise<() => Promise<void>> {
    const name = channel(taskId);
    const subscriber = this.connection();
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
      await subscriber.subscribe(name);
    }
    set.add(handler);

    return async () => {
      const current = this.handlers.get(name);
      current?.delete(handler);
      if (current?.size === 0) {
        this.handlers.delete(name);
        await subscriber.unsubscribe(name).catch(() => undefined);
      }
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber?.quit().catch(() => undefined);
  }

  private connection(): Redis {
    if (!this.subscriber) {
      this.subscriber = this.redis.duplicate();
      this.subscriber.on('message', (name: string, message: string) => {
        const parsed = TaskEventSchema.safeParse(JSON.parse(message));
        if (!parsed.success) {
          this.logger.warn({ channel: name }, 'Dropped a malformed event message');
          return;
        }
        for (const handler of this.handlers.get(name) ?? []) handler(parsed.data);
      });
    }
    return this.subscriber;
  }
}
