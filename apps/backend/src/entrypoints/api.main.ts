import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { ApiModule } from '../api.module.js';
import { configureApiApp } from '../api.setup.js';
import { AppConfig } from '../common/config/app-config.service.js';

async function bootstrap(): Promise<void> {
  const app = configureApiApp(await NestFactory.create(ApiModule, { bufferLogs: true }));
  const port = app.get(AppConfig).get('API_PORT');

  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(error, 'Bootstrap');
  process.exit(1);
});
