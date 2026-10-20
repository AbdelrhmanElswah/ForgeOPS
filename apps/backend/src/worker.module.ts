import { Module } from '@nestjs/common';

import { AppConfigModule } from './common/config/app-config.module.js';
import { LoggingModule } from './infrastructure/logging/logging.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { RedisModule } from './infrastructure/redis/redis.module.js';
import { OrchestratorModule } from './modules/orchestrator/orchestrator.module.js';

/**
 * Root module of the Worker process: queue consumers, the agent orchestrator and the
 * sandbox. It shares infrastructure modules with the API but registers no controllers.
 */
@Module({
  imports: [AppConfigModule, LoggingModule, PrismaModule, RedisModule, OrchestratorModule],
})
export class WorkerModule {}
