import { Module } from '@nestjs/common';

import { AppConfigModule } from './common/config/app-config.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';

/**
 * Root module of the Worker process: queue consumers, the agent orchestrator and the
 * sandbox. It shares infrastructure modules with the API but registers no controllers.
 */
@Module({
  imports: [AppConfigModule, PrismaModule],
})
export class WorkerModule {}
