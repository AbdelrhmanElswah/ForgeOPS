import type { RepositorySettings } from '@forgeops/contracts';

import {
  type RepositoryListQuery,
  type RepositoryRecord,
  RepositoriesRepository,
} from '../../src/modules/repositories/application/repositories.repository.js';
import type {
  InMemoryInstallationsRepository,
  StoredRepository,
} from './in-memory-installations.repository.js';

/**
 * In-memory adapter for RepositoriesRepository. Reads the same storage as the installations
 * fake (in the database both are tables joined by installation), and applies the same
 * ownership filter as the Prisma adapter.
 */
export class InMemoryRepositoriesRepository extends RepositoriesRepository {
  constructor(private readonly installations: InMemoryInstallationsRepository) {
    super();
  }

  findOwned(userId: string, id: string): Promise<RepositoryRecord | null> {
    const row = this.owned(userId).find((repo) => repo.id === id);
    return Promise.resolve(row ? this.toRecord(row) : null);
  }

  listOwned(
    userId: string,
    { limit, cursor, search }: RepositoryListQuery,
  ): Promise<{ items: RepositoryRecord[]; nextCursor: string | null }> {
    const needle = search?.toLowerCase();
    const rows = this.owned(userId)
      .filter(
        (repo) =>
          !needle ||
          repo.name.toLowerCase().includes(needle) ||
          repo.owner.toLowerCase().includes(needle),
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((repo) => !cursor || repo.id > cursor);
    const page = rows.slice(0, limit);
    return Promise.resolve({
      items: page.map((row) => this.toRecord(row)),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    });
  }

  saveSettings(id: string, settings: RepositorySettings): Promise<RepositoryRecord> {
    const row = [...this.installations.repositories.values()].find((repo) => repo.id === id);
    if (!row) return Promise.reject(new Error(`Repository ${id} not found`));
    row.settings = structuredClone(settings);
    return Promise.resolve(this.toRecord(row));
  }

  private owned(userId: string): StoredRepository[] {
    return [...this.installations.repositories.values()].filter((repo) => {
      const installation = this.installations.installations.get(repo.installationId);
      return (
        repo.removedAt === null &&
        installation?.userId === userId &&
        installation.removedAt === null
      );
    });
  }

  private toRecord(row: StoredRepository): RepositoryRecord {
    return {
      id: row.id,
      githubRepoId: row.githubRepoId,
      githubInstallationId: row.installationId,
      owner: row.owner,
      name: row.name,
      defaultBranch: row.defaultBranch,
      isPrivate: row.isPrivate,
      settings: structuredClone(row.settings),
      createdAt: row.createdAt,
    };
  }
}
