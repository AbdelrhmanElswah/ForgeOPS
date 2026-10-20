import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { AppConfig } from '../../common/config/app-config.service.js';
import { PrismaClient } from '../../generated/prisma/client.js';

/**
 * The single Prisma client of a process, shared through Nest DI.
 *
 * It connects lazily on the first query rather than at boot: "is the process alive?"
 * (liveness) must not depend on the database. Database reachability is reported by the
 * readiness check instead (step 1.6), so a database blip doesn't make the orchestrator
 * restart healthy API containers in a loop.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfig) {
    super({ adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL') }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
