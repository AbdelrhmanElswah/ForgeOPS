import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { AppConfig } from '../../common/config/app-config.service.js';
import { buildLoggerParams } from './logging.options.js';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        buildLoggerParams({ LOG_LEVEL: config.get('LOG_LEVEL'), NODE_ENV: config.get('NODE_ENV') }),
    }),
  ],
})
export class LoggingModule {}
