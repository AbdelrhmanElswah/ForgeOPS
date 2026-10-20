import { existsSync } from 'node:fs';

import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads .env by itself. Node's built-in loader avoids a dotenv dependency;
// variables already set in the environment (CI, containers) are never overwritten.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Not needed by `prisma generate`, so it may be undefined in CI build jobs.
    url: process.env.DATABASE_URL ?? '',
  },
});
