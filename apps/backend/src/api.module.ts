import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { AppConfigModule } from './common/config/app-config.module.js';
import { ProblemDetailsFilter } from './common/http/problem-details.filter.js';
import { LoggingModule } from './infrastructure/logging/logging.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { RedisModule } from './infrastructure/redis/redis.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { GitHubIntegrationModule } from './modules/github/github-integration.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { UsersModule } from './modules/users/users.module.js';

/**
 * Root module of the API process: HTTP controllers, auth, SSE, webhooks.
 * It never runs agents or user code. That work is queued for the Worker.
 */
@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    PrismaModule,
    RedisModule,
    HealthModule,
    UsersModule,
    AuthModule,
    GitHubIntegrationModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
})
export class ApiModule {}
