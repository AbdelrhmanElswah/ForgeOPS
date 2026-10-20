import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';

import { AppConfig } from '../../common/config/app-config.service.js';

/** Injection token for the shared ioredis client: `@Inject(REDIS_CLIENT) redis: Redis`. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

function createRedisClient(url: string): Redis {
  const logger = new Logger('Redis');
  const client = new Redis(url, {
    // Fail fast instead of queueing commands while disconnected: a request should get a
    // clear error (and readiness should report "down") rather than hang.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectionName: 'forgeops',
  });

  // ioredis reconnects forever; log only state *changes* so a stopped Redis in development
  // produces one warning instead of one every two seconds.
  let healthy = true;
  client.on('error', (error: NodeJS.ErrnoException) => {
    if (healthy) {
      healthy = false;
      // Connection-refused errors are AggregateErrors with an empty message; `code` has the reason.
      const reason = error.code ?? (error.message || error.name);
      logger.warn(`Connection lost: ${reason} (retrying in background)`);
    }
  });
  client.on('ready', () => {
    if (!healthy) logger.log('Connection restored');
    healthy = true;
  });

  return client;
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => createRedisClient(config.get('REDIS_URL')),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'ready') {
      await this.redis.quit();
    } else {
      this.redis.disconnect();
    }
  }
}
