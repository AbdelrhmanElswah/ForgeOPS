import { performance } from 'node:perf_hooks';

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { withTimeout } from '../../common/utils/with-timeout.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module.js';

const CHECK_TIMEOUT_MS = 2_000;

export interface DependencyStatus {
  status: 'up' | 'down';
  latencyMs: number;
}

export interface ReadinessReport {
  status: 'ok' | 'error';
  checks: Record<string, DependencyStatus>;
}

/**
 * "Can this instance serve traffic right now?" Every dependency is checked in parallel,
 * each with its own timeout, so one hung dependency can't make the probe itself hang.
 * Failure reasons go to the logs only; the public response says just up/down.
 */
@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async check(): Promise<ReadinessReport> {
    const results = await Promise.all([
      this.probe('database', async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      }),
      this.probe('redis', async () => {
        await this.redis.ping();
      }),
    ]);

    const checks = Object.fromEntries(results);
    const allUp = results.every(([, result]) => result.status === 'up');
    return { status: allUp ? 'ok' : 'error', checks };
  }

  private async probe(
    name: string,
    check: () => Promise<void>,
  ): Promise<[string, DependencyStatus]> {
    const startedAt = performance.now();
    const latency = () => Math.round(performance.now() - startedAt);
    try {
      await withTimeout(check(), CHECK_TIMEOUT_MS);
      return [name, { status: 'up', latencyMs: latency() }];
    } catch (error) {
      this.logger.warn({ err: error, dependency: name }, `Readiness check failed: ${name}`);
      return [name, { status: 'down', latencyMs: latency() }];
    }
  }
}
