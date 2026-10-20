import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  ConflictError,
  ForbiddenError,
  UnauthenticatedError,
} from '../../../common/errors/domain-error.js';
import { KeyValueStore } from '../../../infrastructure/redis/key-value.store.js';
import { UsersRepository } from '../../users/users.repository.js';
import { GitHubAppClient } from './github-app.client.js';
import {
  type InstallationRecord,
  InstallationsRepository,
  type InstallationSnapshot,
} from './installations.repository.js';

/** Long enough to click through GitHub's install + sign-in screens, short enough to be useless if leaked. */
export const INSTALL_STATE_TTL_SECONDS = 10 * 60;

const stateKey = (state: string) => `github:install-state:${state}`;

export class InvalidInstallStateError extends ForbiddenError {
  constructor() {
    super('This installation link has expired or was already used. Start again from ForgeOps.');
  }
}

/**
 * Connects GitHub App installations to ForgeOps users.
 *
 * The install redirect hands us an `installation_id` in a URL, i.e. attacker-controllable
 * input. Two independent proofs are required before trusting it:
 *  1. `state`: a single-use random value we issued to a signed-in user. It tells us *which
 *     ForgeOps user* started the flow, and stops a forged callback (OAuth CSRF).
 *  2. GitHub OAuth: GitHub itself confirms the person who just signed in can access that
 *     installation. Without it, anyone could claim another account's installation id.
 */
@Injectable()
export class InstallationService {
  constructor(
    private readonly github: GitHubAppClient,
    private readonly installations: InstallationsRepository,
    private readonly users: UsersRepository,
    private readonly store: KeyValueStore,
  ) {}

  async createInstallUrl(userId: string): Promise<string> {
    const state = randomBytes(32).toString('base64url');
    const url = this.github.installationUrl(state);
    await this.store.setIfAbsent(stateKey(state), userId, INSTALL_STATE_TTL_SECONDS);
    return url;
  }

  async completeInstallation(input: {
    state: string;
    code: string;
    installationId: number;
  }): Promise<InstallationRecord> {
    // `take` = read and delete atomically: a state value works exactly once.
    const userId = await this.store.take(stateKey(input.state));
    if (!userId) {
      throw new InvalidInstallStateError();
    }

    const identity = await this.github.authorizeInstallation(input.code, input.installationId);

    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthenticatedError();
    }
    if (user.githubUserId !== null && user.githubUserId !== identity.githubUserId) {
      throw new ConflictError('Your ForgeOps account is linked to a different GitHub account.');
    }

    const existing = await this.installations.findByInstallationId(input.installationId);
    if (existing?.removedAt === null && existing.userId !== userId) {
      throw new ConflictError(
        'This installation is already connected to another ForgeOps account.',
      );
    }

    await this.users.linkGitHubAccount(userId, identity.githubUserId);
    return this.installations.saveForUser(
      userId,
      await this.snapshot(input.installationId),
      new Date(),
    );
  }

  /** Re-reads an installation from GitHub and reconciles it. No-op for unknown installations. */
  async syncInstallation(installationId: number): Promise<boolean> {
    if (!(await this.installations.findByInstallationId(installationId))) {
      return false;
    }
    return this.installations.refresh(await this.snapshot(installationId), new Date());
  }

  listForUser(userId: string): Promise<InstallationRecord[]> {
    return this.installations.listForUser(userId);
  }

  private async snapshot(installationId: number): Promise<InstallationSnapshot> {
    const [installation, repositories] = await Promise.all([
      this.github.getInstallation(installationId),
      this.github.listInstallationRepositories(installationId),
    ]);
    return { installation, repositories };
  }
}
