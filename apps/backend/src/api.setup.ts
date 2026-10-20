import { type INestApplication, VersioningType } from '@nestjs/common';

import { AppConfig } from './common/config/app-config.service.js';

/**
 * HTTP-level setup shared by `api.main.ts` and the e2e tests, so tests exercise the
 * exact routing, CORS and versioning that production uses.
 */
export function configureApiApp(app: INestApplication): INestApplication {
  const config = app.get(AppConfig);

  // Routes become /api/v1/<controller>; /health stays at the root for probes.
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // The dashboard sends httpOnly auth cookies, so CORS must name the exact origin.
  app.enableCors({ origin: config.get('WEB_ORIGIN'), credentials: true });

  // Lets Nest run onModuleDestroy/onApplicationShutdown hooks on SIGTERM (docker stop).
  app.enableShutdownHooks();

  return app;
}
