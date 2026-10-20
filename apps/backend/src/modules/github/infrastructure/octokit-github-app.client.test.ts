import { createVerify, generateKeyPairSync } from 'node:crypto';

import nock from 'nock';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { NotFoundError } from '../../../common/errors/domain-error.js';
import { TOKEN_SCOPES } from '../application/github-app.client.js';
import { OctokitGitHubAppClient } from './octokit-github-app.client.js';

const API = 'https://api.github.com';
const APP_ID = 123_456;
const INSTALLATION_ID = 42;

// A real RSA key pair, generated per test run: the adapter signs real JWTs and the fake
// GitHub below verifies them with the public key, exactly like api.github.com would.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();

function decodePart(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
}

/** True when the Authorization header carries an app JWT signed by our private key. */
function isValidAppJwt(authorization: string | null): boolean {
  if (!authorization) return false; // an unauthenticated request must never match
  const [header = '', payload = '', signature = ''] = authorization
    .replace(/^bearer /i, '')
    .split('.');
  const signedByUs = createVerify('RSA-SHA256')
    .update(`${header}.${payload}`)
    .verify(publicKey, Buffer.from(signature, 'base64url'));
  const claims = decodePart(payload);
  const nowSeconds = Math.floor(Date.now() / 1000);
  return (
    signedByUs &&
    decodePart(header).alg === 'RS256' &&
    String(claims.iss) === String(APP_ID) &&
    Number(claims.exp) - nowSeconds <= 10 * 60 // GitHub rejects app JWTs living > 10 minutes
  );
}

const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

function mintsToken(token: string, expectedBody?: Record<string, unknown>) {
  return nock(API)
    .post(`/app/installations/${INSTALLATION_ID}/access_tokens`, (body: Record<string, unknown>) =>
      expectedBody ? JSON.stringify(body) === JSON.stringify(expectedBody) : true,
    )
    .matchHeader('authorization', isValidAppJwt)
    .reply(201, { token, expires_at: inOneHour(), repository_selection: 'selected' });
}

describe('OctokitGitHubAppClient', () => {
  const newClient = () =>
    new OctokitGitHubAppClient({
      appId: APP_ID,
      privateKey: privateKeyPem,
      webhookSecret: 'webhook-secret-for-tests',
    });

  beforeAll(() => {
    // Any request we did not explicitly mock fails the test instead of reaching GitHub.
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  describe('scoped installation tokens', () => {
    it('requests a token narrowed to one repository and the given permissions', async () => {
      const github = mintsToken('ghs_clone_token', {
        repository_ids: [7],
        permissions: { contents: 'read', metadata: 'read' },
      });

      const token = await newClient().createScopedToken(INSTALLATION_ID, TOKEN_SCOPES.clone(7));

      expect(token.token).toBe('ghs_clone_token');
      expect(token.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(github.isDone()).toBe(true);
    });

    it('reuses a cached token for the same scope instead of calling GitHub again', async () => {
      const github = mintsToken('ghs_cached'); // can be consumed exactly once
      const client = newClient();

      const first = await client.createScopedToken(INSTALLATION_ID, TOKEN_SCOPES.clone(7));
      const second = await client.createScopedToken(INSTALLATION_ID, TOKEN_SCOPES.clone(7));

      expect(second.token).toBe(first.token);
      expect(github.isDone()).toBe(true);
    });

    it('mints a separate token when the scope differs', async () => {
      mintsToken('ghs_read', {
        repository_ids: [7],
        permissions: { contents: 'read', metadata: 'read' },
      });
      mintsToken('ghs_write', {
        repository_ids: [7],
        permissions: { contents: 'write', pull_requests: 'write', metadata: 'read' },
      });
      const client = newClient();

      const clone = await client.createScopedToken(INSTALLATION_ID, TOKEN_SCOPES.clone(7));
      const publish = await client.createScopedToken(INSTALLATION_ID, TOKEN_SCOPES.publish(7));

      expect(clone.token).toBe('ghs_read');
      expect(publish.token).toBe('ghs_write');
    });
  });

  it('reads installation details with the app JWT', async () => {
    nock(API)
      .get(`/app/installations/${INSTALLATION_ID}`)
      .matchHeader('authorization', isValidAppJwt)
      .reply(200, {
        id: INSTALLATION_ID,
        account: { login: 'acme' },
        target_type: 'Organization',
        suspended_at: null,
      });

    await expect(newClient().getInstallation(INSTALLATION_ID)).resolves.toEqual({
      installationId: INSTALLATION_ID,
      accountLogin: 'acme',
      accountType: 'Organization',
      suspended: false,
    });
  });

  it('follows pagination when listing installation repositories', async () => {
    const repo = (id: number) => ({
      id,
      name: `repo-${id}`,
      owner: { login: 'acme' },
      default_branch: 'main',
      private: true,
    });
    mintsToken('ghs_installation');
    nock(API)
      .get('/installation/repositories')
      .query({ per_page: '100' })
      .matchHeader('authorization', 'token ghs_installation')
      .reply(
        200,
        { total_count: 3, repositories: [repo(1), repo(2)] },
        { link: `<${API}/installation/repositories?per_page=100&page=2>; rel="next"` },
      )
      .get('/installation/repositories')
      .query({ per_page: '100', page: '2' })
      .reply(200, { total_count: 3, repositories: [repo(3)] });

    const repositories = await newClient().listInstallationRepositories(INSTALLATION_ID);

    expect(repositories.map((r) => r.githubRepoId)).toEqual([1, 2, 3]);
    expect(repositories[0]).toEqual({
      githubRepoId: 1,
      owner: 'acme',
      name: 'repo-1',
      defaultBranch: 'main',
      isPrivate: true,
    });
  });

  it('returns the head commit of a branch', async () => {
    mintsToken('ghs_installation');
    nock(API)
      .get('/repos/acme/shop/branches/main')
      .reply(200, { name: 'main', commit: { sha: 'a'.repeat(40) }, protected: true });

    await expect(newClient().getBranchHead(INSTALLATION_ID, 'acme', 'shop', 'main')).resolves.toBe(
      'a'.repeat(40),
    );
  });

  it('translates GitHub 404s into a domain NotFoundError', async () => {
    mintsToken('ghs_installation');
    nock(API).get('/repos/acme/shop/branches/nope').reply(404, { message: 'Branch not found' });

    await expect(
      newClient().getBranchHead(INSTALLATION_ID, 'acme', 'shop', 'nope'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
