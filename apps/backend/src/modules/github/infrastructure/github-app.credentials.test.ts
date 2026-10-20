import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { toProblemDetails } from '../../../common/http/problem-details.mapper.js';
import { GitHubNotConfiguredError } from '../application/github-app.client.js';
import { loadGitHubAppCredentials } from './github-app.credentials.js';
import { UnconfiguredGitHubAppClient } from './unconfigured-github-app.client.js';

const pem = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ type: 'pkcs1', format: 'pem' })
  .toString();
const base = {
  GITHUB_APP_ID: 1,
  GITHUB_APP_SLUG: 'forgeops-test',
  GITHUB_APP_CLIENT_ID: 'Iv23liTestClientId',
  GITHUB_APP_CLIENT_SECRET: 'oauth-client-secret',
  GITHUB_WEBHOOK_SECRET: 'webhook-secret-for-tests',
};

describe('loadGitHubAppCredentials', () => {
  it('returns null when no app is configured', () => {
    expect(
      loadGitHubAppCredentials({
        GITHUB_APP_ID: undefined,
        GITHUB_APP_SLUG: undefined,
        GITHUB_APP_CLIENT_ID: undefined,
        GITHUB_APP_CLIENT_SECRET: undefined,
        GITHUB_WEBHOOK_SECRET: undefined,
        GITHUB_APP_PRIVATE_KEY: undefined,
        GITHUB_APP_PRIVATE_KEY_PATH: undefined,
      }),
    ).toBeNull();
  });

  it('accepts an inline key with escaped newlines (secret-manager style)', () => {
    const credentials = loadGitHubAppCredentials({
      ...base,
      GITHUB_APP_PRIVATE_KEY: pem.replaceAll('\n', '\\n'),
      GITHUB_APP_PRIVATE_KEY_PATH: undefined,
    });

    expect(credentials?.privateKey).toBe(pem);
  });

  it('reads the key from a file relative to the base directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forgeops-key-'));
    writeFileSync(join(dir, 'app.pem'), pem);

    const credentials = loadGitHubAppCredentials(
      { ...base, GITHUB_APP_PRIVATE_KEY: undefined, GITHUB_APP_PRIVATE_KEY_PATH: 'app.pem' },
      dir,
    );

    expect(credentials?.appId).toBe(1);
  });

  it('fails fast on an unreadable or invalid key', () => {
    expect(() =>
      loadGitHubAppCredentials({
        ...base,
        GITHUB_APP_PRIVATE_KEY: undefined,
        GITHUB_APP_PRIVATE_KEY_PATH: 'missing.pem',
      }),
    ).toThrow(/Cannot read the GitHub App private key/);
    expect(() =>
      loadGitHubAppCredentials({
        ...base,
        GITHUB_APP_PRIVATE_KEY: 'not a pem',
        GITHUB_APP_PRIVATE_KEY_PATH: undefined,
      }),
    ).toThrow(/not a valid PEM/);
  });
});

describe('UnconfiguredGitHubAppClient', () => {
  it('fails every call with a 503-mapped domain error', async () => {
    const error = await new UnconfiguredGitHubAppClient()
      .getInstallation()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GitHubNotConfiguredError);
    expect(toProblemDetails(error).status).toBe(503);
  });
});
