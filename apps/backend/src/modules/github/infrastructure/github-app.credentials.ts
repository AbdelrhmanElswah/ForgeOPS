import { createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Env } from '../../../common/config/env.schema.js';

export interface GitHubAppCredentials {
  appId: number;
  slug: string;
  privateKey: string;
  webhookSecret: string;
  clientId: string;
  clientSecret: string;
}

type GitHubEnv = Pick<
  Env,
  | 'GITHUB_APP_ID'
  | 'GITHUB_APP_SLUG'
  | 'GITHUB_APP_PRIVATE_KEY'
  | 'GITHUB_APP_PRIVATE_KEY_PATH'
  | 'GITHUB_WEBHOOK_SECRET'
  | 'GITHUB_APP_CLIENT_ID'
  | 'GITHUB_APP_CLIENT_SECRET'
>;

/**
 * Resolves the app credentials once, at boot. Returns null when no app is configured.
 * A key that is missing or not a valid PEM fails startup here, with a clear message,
 * instead of failing the first GitHub call minutes later.
 * (EnvSchema already guarantees the other fields are present whenever GITHUB_APP_ID is.)
 */
export function loadGitHubAppCredentials(
  env: GitHubEnv,
  baseDir = process.cwd(),
): GitHubAppCredentials | null {
  const {
    GITHUB_APP_ID: appId,
    GITHUB_APP_SLUG: slug,
    GITHUB_WEBHOOK_SECRET: webhookSecret,
    GITHUB_APP_CLIENT_ID: clientId,
    GITHUB_APP_CLIENT_SECRET: clientSecret,
  } = env;
  if (appId === undefined || !slug || !webhookSecret || !clientId || !clientSecret) {
    return null;
  }

  const privateKey = env.GITHUB_APP_PRIVATE_KEY
    ? env.GITHUB_APP_PRIVATE_KEY.replaceAll('\\n', '\n')
    : readKeyFile(resolve(baseDir, env.GITHUB_APP_PRIVATE_KEY_PATH ?? ''));

  try {
    createPrivateKey(privateKey);
  } catch {
    throw new Error('The GitHub App private key is not a valid PEM private key.');
  }

  return { appId, slug, privateKey, webhookSecret, clientId, clientSecret };
}

function readKeyFile(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Cannot read the GitHub App private key at ${path}.`);
  }
}
