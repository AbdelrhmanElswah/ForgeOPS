import { type INestApplication, VersioningType } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

import { AppConfig } from './common/config/app-config.service.js';
import { setupSwagger } from './common/openapi/swagger.setup.js';

/**
 * HTTP-level setup shared by `api.main.ts` and the e2e tests, so tests exercise the
 * exact routing, CORS, logging and versioning that production uses.
 */
export function configureApiApp(app: INestApplication): INestApplication {
  const config = app.get(AppConfig);

  // Route Nest's own logs (bootstrap, errors) through Pino as structured JSON.
  app.useLogger(app.get(Logger));

  // Routes become /api/v1/<controller>; health probes stay at the root.
  app.setGlobalPrefix('api', { exclude: ['health', 'health/ready'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // The dashboard sends httpOnly auth cookies, so CORS must name the exact origin.
  app.enableCors({ origin: config.get('WEB_ORIGIN'), credentials: true });

  // Lets Nest run onModuleDestroy/onApplicationShutdown hooks on SIGTERM (docker stop).
  app.enableShutdownHooks();

  if (!config.isProduction) {
    setupSwagger(app);
  }

  return app;
}
