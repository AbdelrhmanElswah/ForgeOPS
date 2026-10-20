import type { Server } from 'node:http';

import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { ApiModule } from '../../src/api.module.js';
import { configureApiApp } from '../../src/api.setup.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../src/infrastructure/redis/redis.module.js';

export interface FakeDependencies {
  database?: () => Promise<unknown>;
  redis?: () => Promise<unknown>;
}

const healthy = () => Promise.resolve('ok');

/**
 * Boots the real ApiModule (same routing, filters, logging, versioning as production) but
 * swaps Postgres and Redis for in-memory fakes, so HTTP-layer tests run without Docker.
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
    .compile();

  const app = moduleRef.createNestApplication<INestApplication<Server>>({ bufferLogs: true });
  configureApiApp(app);
  await app.init();
  return app;
}
