import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { KeyValueStore } from '../../../infrastructure/redis/key-value.store.js';
import { InstallationService } from './installation.service.js';
import { InstallationsRepository } from './installations.repository.js';

/** GitHub retries failed deliveries for up to 3 days; remember delivery ids at least that long. */
export const DELIVERY_DEDUPE_TTL_SECONDS = 3 * 24 * 60 * 60;

export type WebhookOutcome = 'processed' | 'duplicate' | 'ignored';

export interface WebhookDelivery {
  event: string;
  deliveryId: string;
  payload: unknown;
}

// Only the fields we use. Signed by GitHub doesn't mean "shaped like we expect".
const InstallationEventSchema = z.object({
  action: z.string(),
  installation: z.object({ id: z.number().int().positive() }),
});

/**
 * Routes verified webhook deliveries to handlers (one per event type). Each delivery is
 * processed at most once: GitHub redelivers on timeouts and lets admins redeliver by hand,
 * so the same delivery id can arrive several times.
 */
@Injectable()
export class GitHubWebhookService {
  private readonly logger = new Logger(GitHubWebhookService.name);

  private readonly handlers: Record<string, (payload: unknown) => Promise<void>> = {
    installation: (payload) => this.onInstallation(payload),
    installation_repositories: (payload) => this.onInstallationRepositories(payload),
  };

  constructor(
    private readonly store: KeyValueStore,
    private readonly installations: InstallationsRepository,
    private readonly installationService: InstallationService,
  ) {}

  async handle({ event, deliveryId, payload }: WebhookDelivery): Promise<WebhookOutcome> {
    const handler = this.handlers[event];
    if (!handler) {
      return 'ignored'; // e.g. `ping`, or `pull_request` until Phase 6
    }

    const key = `github:delivery:${deliveryId}`;
    if (!(await this.store.setIfAbsent(key, event, DELIVERY_DEDUPE_TTL_SECONDS))) {
      return 'duplicate';
    }
    try {
      await handler(payload);
      return 'processed';
    } catch (error) {
      // Release the claim so GitHub's retry of this delivery gets processed.
      await this.store.delete(key);
      throw error;
    }
  }

  private async onInstallation(payload: unknown): Promise<void> {
    const { action, installation } = InstallationEventSchema.parse(payload);
    switch (action) {
      case 'deleted':
        await this.installations.markRemoved(installation.id, new Date());
        break;
      case 'suspend':
        await this.installations.setSuspended(installation.id, new Date());
        break;
      case 'unsuspend':
        await this.installations.setSuspended(installation.id, null);
        break;
      default:
        // `created` arrives before the user finishes OAuth, so an unknown installation is
        // normal here: the install callback links it. Otherwise refresh what we know.
        await this.installationService.syncInstallation(installation.id);
    }
    this.logger.log({ installationId: installation.id, action }, 'Installation event handled');
  }

  private async onInstallationRepositories(payload: unknown): Promise<void> {
    const { installation } = InstallationEventSchema.parse(payload);
    // Rather than applying the added/removed lists (which can arrive out of order), ask
    // GitHub for the current full list and reconcile. Same result however events interleave.
    await this.installationService.syncInstallation(installation.id);
  }
}
