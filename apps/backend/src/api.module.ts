import { Module } from '@nestjs/common';

import { AppConfigModule } from './common/config/app-config.module.js';
import { HealthModule } from './modules/health/health.module.js';

/**
 * Root module of the API process: HTTP controllers, auth, SSE, webhooks.
 * It never runs agents or user code. That work is queued for the Worker.
 */
@Module({
  imports: [AppConfigModule, HealthModule],
})
export class ApiModule {}
