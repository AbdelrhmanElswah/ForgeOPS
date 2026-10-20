import { beforeEach, describe, expect, it } from 'vitest';

import { FakeGitHubAppClient } from '../../../../test/fakes/fake-github-app.client.js';
import { InMemoryInstallationsRepository } from '../../../../test/fakes/in-memory-installations.repository.js';
import { InMemoryKeyValueStore } from '../../../../test/fakes/in-memory-key-value.store.js';
import { InMemoryUsersRepository } from '../../../../test/fakes/in-memory-users.repository.js';
import { ConflictError } from '../../../common/errors/domain-error.js';
import { InstallationAccessDeniedError } from './github-app.client.js';
import {
  INSTALL_STATE_TTL_SECONDS,
  InstallationService,
  InvalidInstallStateError,
} from './installation.service.js';

const INSTALLATION = 42;
const OCTOCAT = { githubUserId: 9001, login: 'octocat' };

function setup() {
  const github = new FakeGitHubAppClient();
  const installations = new InMemoryInstallationsRepository();
  const users = new InMemoryUsersRepository();
  const store = new InMemoryKeyValueStore();
  const service = new InstallationService(github, installations, users, store);
  github.addInstallation(INSTALLATION, 'octocat', [1, 2, 3]);
  return { github, installations, users, store, service };
}

/** Runs the dashboard half of the flow and returns the `state` GitHub would echo back. */
async function startFlow(service: InstallationService, userId: string): Promise<string> {
  const url = new URL(await service.createInstallUrl(userId));
  return url.searchParams.get('state') ?? '';
}

describe('InstallationService', () => {
  let ctx: ReturnType<typeof setup>;
  let userId: string;

  beforeEach(async () => {
    ctx = setup();
    userId = (
      await ctx.users.create({ email: 'dev@example.com', passwordHash: 'x', displayName: null })
    ).id;
  });

  it('issues a short-lived, unguessable state bound to the user', async () => {
    const state = await startFlow(ctx.service, userId);

    expect(state.length).toBeGreaterThanOrEqual(40);
    const entry = ctx.store.entries.get(`github:install-state:${state}`);
    expect(entry).toEqual({ value: userId, ttlSeconds: INSTALL_STATE_TTL_SECONDS });
  });

  it('links the installation, its repositories and the GitHub account', async () => {
    const state = await startFlow(ctx.service, userId);
    ctx.github.oauthCodes.set('code-1', { user: OCTOCAT, installationIds: [INSTALLATION] });

    const record = await ctx.service.completeInstallation({
      state,
      code: 'code-1',
      installationId: INSTALLATION,
    });

    expect(record).toMatchObject({ userId, accountLogin: 'octocat', repositoryCount: 3 });
    expect((await ctx.users.findById(userId))?.githubUserId).toBe(OCTOCAT.githubUserId);
  });

  it('rejects an unknown state (forged callback)', async () => {
    ctx.github.oauthCodes.set('code-1', { user: OCTOCAT, installationIds: [INSTALLATION] });

    await expect(
      ctx.service.completeInstallation({ state: 'forged', code: 'code-1', installationId: 42 }),
    ).rejects.toBeInstanceOf(InvalidInstallStateError);
  });

  it('accepts each state only once (replayed callback)', async () => {
    const state = await startFlow(ctx.service, userId);
    ctx.github.oauthCodes.set('code-1', { user: OCTOCAT, installationIds: [INSTALLATION] });
    await ctx.service.completeInstallation({ state, code: 'code-1', installationId: INSTALLATION });

    ctx.github.oauthCodes.set('code-2', { user: OCTOCAT, installationIds: [INSTALLATION] });
    await expect(
      ctx.service.completeInstallation({ state, code: 'code-2', installationId: INSTALLATION }),
    ).rejects.toBeInstanceOf(InvalidInstallStateError);
  });

  it("refuses someone else's installation id and saves nothing", async () => {
    const state = await startFlow(ctx.service, userId);
    ctx.github.addInstallation(77, 'victim-org', [10]);
    // The attacker signed in to GitHub, but can only access installation 42.
    ctx.github.oauthCodes.set('code-1', { user: OCTOCAT, installationIds: [INSTALLATION] });

    await expect(
      ctx.service.completeInstallation({ state, code: 'code-1', installationId: 77 }),
    ).rejects.toBeInstanceOf(InstallationAccessDeniedError);
    expect(await ctx.installations.findByInstallationId(77)).toBeNull();
  });

  it('refuses an installation already connected to another ForgeOps user', async () => {
    const other = await ctx.users.create({
      email: 'other@example.com',
      passwordHash: 'x',
      displayName: null,
    });
    await ctx.installations.saveForUser(other.id, ctx.github.snapshot(INSTALLATION), new Date());
    const state = await startFlow(ctx.service, userId);
    ctx.github.oauthCodes.set('code-1', { user: OCTOCAT, installationIds: [INSTALLATION] });

    await expect(
      ctx.service.completeInstallation({ state, code: 'code-1', installationId: INSTALLATION }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('syncs a known installation and ignores unknown ones', async () => {
    const state = await startFlow(ctx.service, userId);
    ctx.github.oauthCodes.set('code-1', { user: OCTOCAT, installationIds: [INSTALLATION] });
    await ctx.service.completeInstallation({ state, code: 'code-1', installationId: INSTALLATION });

    ctx.github.addInstallation(INSTALLATION, 'octocat', [1, 4]); // repo 2 & 3 removed, 4 added

    await expect(ctx.service.syncInstallation(INSTALLATION)).resolves.toBe(true);
    expect(ctx.installations.activeRepositoryIds(INSTALLATION)).toEqual([1, 4]);
    await expect(ctx.service.syncInstallation(999)).resolves.toBe(false);
  });
});
