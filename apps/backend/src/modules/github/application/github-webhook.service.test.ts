import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeGitHubAppClient } from '../../../../test/fakes/fake-github-app.client.js';
import { InMemoryInstallationsRepository } from '../../../../test/fakes/in-memory-installations.repository.js';
import { InMemoryKeyValueStore } from '../../../../test/fakes/in-memory-key-value.store.js';
import { InMemoryUsersRepository } from '../../../../test/fakes/in-memory-users.repository.js';
import { GitHubWebhookService } from './github-webhook.service.js';
import { InstallationService } from './installation.service.js';

const INSTALLATION = 42;

function setup() {
  const github = new FakeGitHubAppClient();
  const installations = new InMemoryInstallationsRepository();
  const store = new InMemoryKeyValueStore();
  const installationService = new InstallationService(
    github,
    installations,
    new InMemoryUsersRepository(),
    store,
  );
  const webhooks = new GitHubWebhookService(store, installations, installationService);
  return { github, installations, store, installationService, webhooks };
}

let deliveryCounter = 0;
const delivery = (event: string, payload: unknown) => ({
  event,
  deliveryId: `delivery-${String(++deliveryCounter)}`,
  payload,
});

describe('GitHubWebhookService', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(async () => {
    ctx = setup();
    ctx.github.addInstallation(INSTALLATION, 'octocat', [1, 2]);
    await ctx.installations.saveForUser('user-1', ctx.github.snapshot(INSTALLATION), new Date());
  });

  it('marks the installation and its repositories removed on uninstall', async () => {
    await expect(
      ctx.webhooks.handle(
        delivery('installation', { action: 'deleted', installation: { id: INSTALLATION } }),
      ),
    ).resolves.toBe('processed');

    expect((await ctx.installations.findByInstallationId(INSTALLATION))?.removedAt).not.toBeNull();
    expect(ctx.installations.activeRepositoryIds(INSTALLATION)).toEqual([]);
  });

  it('tracks suspend and unsuspend', async () => {
    await ctx.webhooks.handle(
      delivery('installation', { action: 'suspend', installation: { id: INSTALLATION } }),
    );
    expect(
      (await ctx.installations.findByInstallationId(INSTALLATION))?.suspendedAt,
    ).not.toBeNull();

    await ctx.webhooks.handle(
      delivery('installation', { action: 'unsuspend', installation: { id: INSTALLATION } }),
    );
    expect((await ctx.installations.findByInstallationId(INSTALLATION))?.suspendedAt).toBeNull();
  });

  it('reconciles repositories when the selection changes', async () => {
    ctx.github.addInstallation(INSTALLATION, 'octocat', [2, 3]);

    await ctx.webhooks.handle(
      delivery('installation_repositories', {
        action: 'added',
        installation: { id: INSTALLATION },
      }),
    );

    expect(ctx.installations.activeRepositoryIds(INSTALLATION)).toEqual([2, 3]);
  });

  it('processes a redelivered delivery id only once', async () => {
    const sync = vi.spyOn(ctx.installationService, 'syncInstallation');
    const event = delivery('installation_repositories', {
      action: 'added',
      installation: { id: INSTALLATION },
    });

    await expect(ctx.webhooks.handle(event)).resolves.toBe('processed');
    await expect(ctx.webhooks.handle(event)).resolves.toBe('duplicate');
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('releases the dedupe claim when processing fails, so a retry can succeed', async () => {
    const event = delivery('installation_repositories', {
      action: 'added',
      installation: { id: INSTALLATION },
    });
    vi.spyOn(ctx.installationService, 'syncInstallation').mockRejectedValueOnce(
      new Error('GitHub timeout'),
    );

    await expect(ctx.webhooks.handle(event)).rejects.toThrow('GitHub timeout');
    await expect(ctx.webhooks.handle(event)).resolves.toBe('processed');
  });

  it('ignores events it has no handler for (without claiming the delivery)', async () => {
    const event = delivery('ping', { zen: 'Keep it logically awesome.' });

    await expect(ctx.webhooks.handle(event)).resolves.toBe('ignored');
    expect(ctx.store.entries.size).toBe(0);
  });

  it('rejects a payload that lacks the fields it relies on', async () => {
    await expect(
      ctx.webhooks.handle(delivery('installation', { action: 'deleted' })),
    ).rejects.toThrow();
  });
});
