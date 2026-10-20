import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppConfig } from '../common/config/app-config.service.js';
import { WorkerModule } from '../worker.module.js';

async function bootstrap(): Promise<void> {
  // An application context is the Nest DI container without an HTTP server.
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  app.enableShutdownHooks();

  const concurrency = app.get(AppConfig).get('WORKER_CONCURRENCY');
  Logger.log(`Worker started (concurrency: ${concurrency})`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(error, 'Bootstrap');
  process.exit(1);
});
