import {
  type BranchList,
  IdSchema,
  type ListRepositoriesQuery,
  type Repository,
  type RepositoryPage,
  RepositorySettingsSchema,
  type UpdateRepositorySettingsRequest,
} from '@forgeops/contracts';
import { Injectable } from '@nestjs/common';

import { NotFoundError, ValidationError } from '../../../common/errors/domain-error.js';
import { GitHubAppClient } from '../../github/application/github-app.client.js';
import { type RepositoryRecord, RepositoriesRepository } from './repositories.repository.js';

@Injectable()
export class RepositoriesService {
  constructor(
    private readonly repositories: RepositoriesRepository,
    private readonly github: GitHubAppClient,
  ) {}

  async list(userId: string, query: ListRepositoriesQuery): Promise<RepositoryPage> {
    if (query.cursor && !IdSchema.safeParse(query.cursor).success) {
      throw new ValidationError([{ path: 'cursor', message: 'Invalid cursor' }]);
    }
    const page = await this.repositories.listOwned(userId, query);
    return { items: page.items.map(toRepositoryDto), nextCursor: page.nextCursor };
  }

  async get(userId: string, id: string): Promise<Repository> {
    return toRepositoryDto(await this.requireOwned(userId, id));
  }

  /** Live from GitHub, so a branch pushed a minute ago is selectable as a task's base. */
  async listBranches(userId: string, id: string): Promise<BranchList> {
    const repository = await this.requireOwned(userId, id);
    const items = await this.github.listBranches(
      repository.githubInstallationId,
      repository.owner,
      repository.name,
    );
    return { items };
  }

  async updateSettings(
    userId: string,
    id: string,
    patch: UpdateRepositorySettingsRequest,
  ): Promise<Repository> {
    const repository = await this.requireOwned(userId, id);
    const current = RepositorySettingsSchema.parse(repository.settings);
    // Merge, then validate the *result*: a patch is only valid if the whole outcome is.
    const next = RepositorySettingsSchema.parse({
      ...current,
      ...patch,
      limits: { ...current.limits, ...patch.limits },
    });
    return toRepositoryDto(await this.repositories.saveSettings(repository.id, next));
  }

  /**
   * Another user's repository is reported as *not found*, not forbidden: a 403 would confirm
   * that the id exists, which leaks information about other accounts.
   */
  private async requireOwned(userId: string, id: string): Promise<RepositoryRecord> {
    const repository = await this.repositories.findOwned(userId, id);
    if (!repository) {
      throw new NotFoundError('Repository');
    }
    return repository;
  }
}

function toRepositoryDto(record: RepositoryRecord): Repository {
  return {
    id: record.id,
    githubRepoId: record.githubRepoId,
    owner: record.owner,
    name: record.name,
    fullName: `${record.owner}/${record.name}`,
    defaultBranch: record.defaultBranch,
    isPrivate: record.isPrivate,
    // Stored `{}` (a freshly connected repo) becomes complete defaults here.
    settings: RepositorySettingsSchema.parse(record.settings),
    createdAt: record.createdAt.toISOString(),
  };
}
