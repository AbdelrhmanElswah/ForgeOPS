import type { RepositorySettings } from '@forgeops/contracts';

export interface RepositoryRecord {
  id: string;
  githubRepoId: number;
  /** GitHub's installation id, needed to mint tokens for this repository. */
  githubInstallationId: number;
  owner: string;
  name: string;
  defaultBranch: string;
  isPrivate: boolean;
  /** Raw stored JSON; parse with RepositorySettingsSchema before use. */
  settings: unknown;
  createdAt: Date;
}

export interface RepositoryListQuery {
  limit: number;
  /** Id of the last item of the previous page. */
  cursor?: string;
  search?: string;
}

/**
 * Port for connected repositories. Every read takes the `userId` and filters by ownership
 * *inside the query*: there is no "fetch by id, then check owner" path that a future
 * caller could forget to complete. Removed repositories and installations are invisible.
 */
export abstract class RepositoriesRepository {
  abstract findOwned(userId: string, id: string): Promise<RepositoryRecord | null>;
  abstract listOwned(
    userId: string,
    query: RepositoryListQuery,
  ): Promise<{ items: RepositoryRecord[]; nextCursor: string | null }>;
  abstract saveSettings(id: string, settings: RepositorySettings): Promise<RepositoryRecord>;
}
