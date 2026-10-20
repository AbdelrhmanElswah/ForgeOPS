import type { Server } from 'node:http';

import { CSRF_HEADER, CSRF_HEADER_VALUE, InstallUrlResponseSchema } from '@forgeops/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { GitHubAppClient } from '../../src/modules/github/application/github-app.client.js';
import type { FakeGitHubAppClient } from '../fakes/fake-github-app.client.js';

export type Agent = ReturnType<typeof request.agent>;

/** Registers a user and returns a cookie-keeping agent that sends the CSRF header. */
export async function signUp(app: INestApplication<Server>, email: string): Promise<Agent> {
  const agent = request.agent(app.getHttpServer()).set(CSRF_HEADER, CSRF_HEADER_VALUE);
  await agent
    .post('/api/v1/auth/register')
    .send({ email, password: 'correct horse battery staple' })
    .expect(201);
  return agent;
}

/**
 * Connects a GitHub installation for the agent's user through the real install flow
 * (install-url → fake GitHub OAuth → callback), so tests start from realistic data.
 */
export async function connectInstallation(
  app: INestApplication<Server>,
  agent: Agent,
  options: { installationId: number; login: string; githubUserId: number; repoIds: number[] },
): Promise<void> {
  const github = app.get<FakeGitHubAppClient>(GitHubAppClient);
  github.addInstallation(options.installationId, options.login, options.repoIds);

  const body: unknown = (await agent.get('/api/v1/github/install-url').expect(200)).body;
  const state = new URL(InstallUrlResponseSchema.parse(body).url).searchParams.get('state') ?? '';
  const code = `code-${String(options.installationId)}`;
  github.oauthCodes.set(code, {
    user: { githubUserId: options.githubUserId, login: options.login },
    installationIds: [options.installationId],
  });

  const callback = await request(app.getHttpServer())
    .get('/api/v1/github/oauth/callback')
    .query({ code, installation_id: options.installationId, state })
    .expect(302);
  if (!String(callback.headers.location).includes('github=connected')) {
    throw new Error(`Install flow failed: ${String(callback.headers.location)}`);
  }
}
