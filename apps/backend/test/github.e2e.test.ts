import type { Server } from 'node:http';

import {
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  GitHubInstallationListSchema,
  InstallUrlResponseSchema,
} from '@forgeops/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GitHubAppClient } from '../src/modules/github/application/github-app.client.js';
import { signWebhookBody } from '../src/modules/github/application/webhook-signature.js';
import { FAKE_WEBHOOK_SECRET, type FakeGitHubAppClient } from './fakes/fake-github-app.client.js';
import { createTestApp } from './utils/create-test-app.js';

const INSTALLATION = 42;
const OCTOCAT = { githubUserId: 9001, login: 'octocat' };

describe('GitHub integration (e2e)', () => {
  let app: INestApplication<Server>;
  let github: FakeGitHubAppClient;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    app = await createTestApp();
    github = app.get(GitHubAppClient);
    github.addInstallation(INSTALLATION, 'octocat', [1, 2, 3]);

    agent = request.agent(app.getHttpServer()).set(CSRF_HEADER, CSRF_HEADER_VALUE);
    await agent
      .post('/api/v1/auth/register')
      .send({ email: 'dev@example.com', password: 'correct horse battery staple' })
      .expect(201);
  });

  afterEach(async () => {
    await app.close();
  });

  async function installState(): Promise<string> {
    const response = await agent.get('/api/v1/github/install-url').expect(200);
    const { url } = InstallUrlResponseSchema.parse(response.body);
    return new URL(url).searchParams.get('state') ?? '';
  }

  describe('install flow', () => {
    it('requires a signed-in user to start', async () => {
      await request(app.getHttpServer()).get('/api/v1/github/install-url').expect(401);
    });

    it('connects the installation and redirects back to the dashboard', async () => {
      const state = await installState();
      github.oauthCodes.set('oauth-code', { user: OCTOCAT, installationIds: [INSTALLATION] });

      // GitHub's redirect: a plain browser navigation, no CSRF header, identity via `state`.
      const callback = await request(app.getHttpServer())
        .get('/api/v1/github/oauth/callback')
        .query({
          code: 'oauth-code',
          installation_id: INSTALLATION,
          setup_action: 'install',
          state,
        })
        .expect(302);
      expect(callback.headers.location).toBe(
        'http://localhost:3000/settings/integrations?github=connected',
      );

      const list = await agent.get('/api/v1/github/installations').expect(200);
      expect(GitHubInstallationListSchema.parse(list.body).items).toEqual([
        expect.objectContaining({
          installationId: INSTALLATION,
          accountLogin: 'octocat',
          repositoryCount: 3,
          suspended: false,
        }),
      ]);
    });

    it('redirects with a reason instead of an error page when ownership fails', async () => {
      const state = await installState();
      github.oauthCodes.set('oauth-code', { user: OCTOCAT, installationIds: [999] });

      const callback = await request(app.getHttpServer())
        .get('/api/v1/github/oauth/callback')
        .query({ code: 'oauth-code', installation_id: INSTALLATION, state })
        .expect(302);

      expect(callback.headers.location).toBe(
        'http://localhost:3000/settings/integrations?github=error&reason=forbidden',
      );
      const list = await agent.get('/api/v1/github/installations').expect(200);
      expect(GitHubInstallationListSchema.parse(list.body).items).toEqual([]);
    });

    it('treats a repository-selection update without state as informational', async () => {
      const callback = await request(app.getHttpServer())
        .get('/api/v1/github/oauth/callback')
        .query({ code: 'x', installation_id: INSTALLATION, setup_action: 'update' })
        .expect(302);

      expect(callback.headers.location).toContain('github=updated');
    });
  });

  describe('webhooks', () => {
    function deliver(
      event: string,
      payload: object,
      options: { deliveryId?: string; secret?: string } = {},
    ) {
      const body = JSON.stringify(payload);
      return request(app.getHttpServer())
        .post('/api/v1/webhooks/github')
        .set('content-type', 'application/json')
        .set('x-github-event', event)
        .set('x-github-delivery', options.deliveryId ?? crypto.randomUUID())
        .set('x-hub-signature-256', signWebhookBody(options.secret ?? FAKE_WEBHOOK_SECRET, body))
        .send(body);
    }

    it('rejects a delivery with a forged signature', async () => {
      await deliver('ping', { zen: 'hi' }, { secret: 'attacker-guess' }).expect(401);
    });

    it('rejects a delivery with no signature at all', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/webhooks/github')
        .set('x-github-event', 'ping')
        .set('x-github-delivery', 'd-1')
        .send({ zen: 'hi' })
        .expect(401);
    });

    it('accepts a signed delivery without a CSRF header or session', async () => {
      const response = await deliver('ping', { zen: 'hi' }).expect(202);
      expect(response.body).toEqual({ outcome: 'ignored' });
    });

    it('processes each delivery id once', async () => {
      const payload = { action: 'suspend', installation: { id: INSTALLATION } };

      const first = await deliver('installation', payload, { deliveryId: 'same-id' }).expect(202);
      const second = await deliver('installation', payload, { deliveryId: 'same-id' }).expect(202);

      expect(first.body).toEqual({ outcome: 'processed' });
      expect(second.body).toEqual({ outcome: 'duplicate' });
    });
  });
});
