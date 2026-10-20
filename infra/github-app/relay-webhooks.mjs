#!/usr/bin/env node
/**
 * Development only: relays GitHub webhooks from the app's smee.io channel to the local API.
 *
 *   pnpm github:webhooks
 *
 * smee.io forwards the request exactly as GitHub sent it (same body, same X-Hub-Signature-256),
 * so the API verifies it with the webhook secret like any real delivery: the relay is not trusted.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { SmeeClient } from 'smee-client';

const envFile = resolve(import.meta.dirname, '../../apps/backend/.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const source = process.env.GITHUB_WEBHOOK_PROXY_URL;
const port = process.env.API_PORT ?? '3001';
const target = `http://localhost:${port}/api/v1/webhooks/github`;

if (!source) {
  console.error('✖ GITHUB_WEBHOOK_PROXY_URL is not set. Run `pnpm github:create-app` first.');
  process.exit(1);
}

console.log(`Relaying ${source}\n      → ${target}\n(Ctrl+C to stop)`);
await new SmeeClient({ source, target, logger: console }).start();
