import type { Server } from 'node:http';

import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { ApiModule } from '../../src/api.module.js';
import { configureApiApp } from '../../src/api.setup.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../src/infrastructure/redis/redis.module.js';
import { SessionsRepository } from '../../src/modules/auth/application/sessions.repository.js';
import { UsersRepository } from '../../src/modules/users/users.repository.js';
import { InMemorySessionsRepository } from '../fakes/in-memory-sessions.repository.js';
import { InMemoryUsersRepository } from '../fakes/in-memory-users.repository.js';

export interface FakeDependencies {
  database?: () => Promise<unknown>;
  redis?: () => Promise<unknown>;
}

const healthy = () => Promise.resolve('ok');

/**
 * Boots the real ApiModule (same routing, filters, logging, versioning as production) but
 * swaps Postgres, Redis and the repositories for in-memory fakes, so HTTP-layer tests run
 * without Docker. Fetch a fake with `app.get(UsersRepository)` to inspect or seed it.
 * Integration tests against real containers come in step 8.1.
 */
export async function createTestApp(
  options: { controllers?: Type[] } & FakeDependencies = {},
): Promise<INestApplication<Server>> {
  const database = options.database ?? healthy;
  const redis = options.redis ?? healthy;

  const moduleRef = await Test.createTestingModule({
    imports: [ApiModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(PrismaService)
    .useValue({ $queryRaw: database, $disconnect: healthy })
    .overrideProvider(REDIS_CLIENT)
    .useValue({ ping: redis, status: 'end', disconnect: () => undefined })
    .overrideProvider(UsersRepository)
    .useValue(new InMemoryUsersRepository())
    .overrideProvider(SessionsRepository)
    .useValue(new InMemorySessionsRepository())
    .compile();

  const app = moduleRef.createNestApplication<INestApplication<Server>>({ bufferLogs: true });
  configureApiApp(app);
  await app.init();
  return app;
}
