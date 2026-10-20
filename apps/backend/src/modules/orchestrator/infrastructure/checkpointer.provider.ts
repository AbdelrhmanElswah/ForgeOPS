import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { AppConfig } from '../../../common/config/app-config.service.js';

/**
 * Owns the Postgres checkpointer: graph state is written after every node, in its own
 * `langgraph` schema of the application database (one less service to run).
 * `setup()` creates or migrates its tables at boot, and is idempotent.
 */
@Injectable()
export class CheckpointerHost implements OnModuleInit, OnModuleDestroy {
  readonly saver: PostgresSaver;

  constructor(config: AppConfig) {
    this.saver = PostgresSaver.fromConnString(config.get('DATABASE_URL'), { schema: 'langgraph' });
  }

  async onModuleInit(): Promise<void> {
    await this.saver.setup();
  }

  async onModuleDestroy(): Promise<void> {
    await this.saver.end();
  }
}
