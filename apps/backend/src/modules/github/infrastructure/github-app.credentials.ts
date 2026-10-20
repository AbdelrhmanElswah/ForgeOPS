import { createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Env } from '../../../common/config/env.schema.js';

export interface GitHubAppCredentials {
  appId: number;
  privateKey: string;
  webhookSecret: string;
}

type GitHubEnv = Pick<
  Env,
  | 'GITHUB_APP_ID'
  | 'GITHUB_APP_PRIVATE_KEY'
  | 'GITHUB_APP_PRIVATE_KEY_PATH'
  | 'GITHUB_WEBHOOK_SECRET'
>;

/**
 * Resolves the app credentials once, at boot. Returns null when no app is configured.
 * A key that is missing or not a valid PEM fails startup here, with a clear message,
 * instead of failing the first GitHub call minutes later.
 */
export function loadGitHubAppCredentials(
  env: GitHubEnv,
  baseDir = process.cwd(),
): GitHubAppCredentials | null {
  if (env.GITHUB_APP_ID === undefined || env.GITHUB_WEBHOOK_SECRET === undefined) {
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

  return { appId: env.GITHUB_APP_ID, privateKey, webhookSecret: env.GITHUB_WEBHOOK_SECRET };
}

function readKeyFile(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Cannot read the GitHub App private key at ${path}.`);
  }
}
