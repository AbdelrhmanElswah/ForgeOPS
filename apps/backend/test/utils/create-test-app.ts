import type { Server } from 'node:http';

import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { ApiModule } from '../../src/api.module.js';
import { configureApiApp } from '../../src/api.setup.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { KeyValueStore } from '../../src/infrastructure/redis/key-value.store.js';
import { REDIS_CLIENT } from '../../src/infrastructure/redis/redis.module.js';
import { SessionsRepository } from '../../src/modules/auth/application/sessions.repository.js';
import { GitHubAppClient } from '../../src/modules/github/application/github-app.client.js';
import { InstallationsRepository } from '../../src/modules/github/application/installations.repository.js';
import { RepositoriesRepository } from '../../src/modules/repositories/application/repositories.repository.js';
import { UsersRepository } from '../../src/modules/users/users.repository.js';
import { FakeGitHubAppClient } from '../fakes/fake-github-app.client.js';
import { InMemoryInstallationsRepository } from '../fakes/in-memory-installations.repository.js';
import { InMemoryKeyValueStore } from '../fakes/in-memory-key-value.store.js';
import { InMemoryRepositoriesRepository } from '../fakes/in-memory-repositories.repository.js';
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

  // Installations and repositories share storage, as their tables do in Postgres.
  const installations = new InMemoryInstallationsRepository();

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
    .overrideProvider(KeyValueStore)
    .useValue(new InMemoryKeyValueStore())
    .overrideProvider(InstallationsRepository)
    .useValue(installations)
    .overrideProvider(RepositoriesRepository)
    .useValue(new InMemoryRepositoriesRepository(installations))
    .overrideProvider(GitHubAppClient)
    .useValue(new FakeGitHubAppClient())
    .compile();

  const app = moduleRef.createNestApplication<INestApplication<Server>>({
    bufferLogs: true,
    // Keeps the exact request bytes on req.rawBody: webhook signatures are computed over them.
    rawBody: true,
  });
  configureApiApp(app);
  await app.init();
  return app;
}
