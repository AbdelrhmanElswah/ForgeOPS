import { randomUUID } from 'node:crypto';

import type { GitHubRepositoryInfo } from '../../src/modules/github/application/github-app.client.js';
import {
  type InstallationRecord,
  InstallationsRepository,
  type InstallationSnapshot,
} from '../../src/modules/github/application/installations.repository.js';

/** Mirrors a `repositories` row. Shared with InMemoryRepositoriesRepository, like the real table. */
export interface StoredRepository extends GitHubRepositoryInfo {
  id: string;
  installationId: number;
  settings: unknown;
  removedAt: Date | null;
  createdAt: Date;
}

/** In-memory adapter mirroring PrismaInstallationsRepository's reconciliation semantics. */
export class InMemoryInstallationsRepository extends InstallationsRepository {
  readonly installations = new Map<number, Omit<InstallationRecord, 'repositoryCount'>>();
  readonly repositories = new Map<number, StoredRepository>();

  findByInstallationId(installationId: number): Promise<InstallationRecord | null> {
    return Promise.resolve(this.toRecord(installationId));
  }

  saveForUser(
    userId: string,
    snapshot: InstallationSnapshot,
    now: Date,
  ): Promise<InstallationRecord> {
    const { installation } = snapshot;
    const existing = this.installations.get(installation.installationId);
    this.installations.set(installation.installationId, {
      id: existing?.id ?? randomUUID(),
      createdAt: existing?.createdAt ?? now,
      installationId: installation.installationId,
      userId,
      accountLogin: installation.accountLogin,
      accountType: installation.accountType,
      suspendedAt: installation.suspended ? now : null,
      removedAt: null,
    });
    this.reconcile(snapshot, now);
    return Promise.resolve(this.requireRecord(installation.installationId));
  }

  refresh(snapshot: InstallationSnapshot, now: Date): Promise<boolean> {
    const existing = this.installations.get(snapshot.installation.installationId);
    if (!existing) return Promise.resolve(false);
    existing.accountLogin = snapshot.installation.accountLogin;
    existing.suspendedAt = snapshot.installation.suspended ? now : null;
    this.reconcile(snapshot, now);
    return Promise.resolve(true);
  }

  setSuspended(installationId: number, suspendedAt: Date | null): Promise<void> {
    const existing = this.installations.get(installationId);
    if (existing) existing.suspendedAt = suspendedAt;
    return Promise.resolve();
  }

  markRemoved(installationId: number, now: Date): Promise<void> {
    const existing = this.installations.get(installationId);
    if (existing) existing.removedAt = now;
    for (const repo of this.repositories.values()) {
      if (repo.installationId === installationId && !repo.removedAt) repo.removedAt = now;
    }
    return Promise.resolve();
  }

  listForUser(userId: string): Promise<InstallationRecord[]> {
    return Promise.resolve(
      [...this.installations.values()]
        .filter((i) => i.userId === userId && i.removedAt === null)
        .map((i) => this.requireRecord(i.installationId)),
    );
  }

  /** Repositories currently granted (not removed), for assertions. */
  activeRepositoryIds(installationId: number): number[] {
    return [...this.repositories.values()]
      .filter((r) => r.installationId === installationId && r.removedAt === null)
      .map((r) => r.githubRepoId);
  }

  private reconcile({ installation, repositories }: InstallationSnapshot, now: Date): void {
    const current = new Set(repositories.map((r) => r.githubRepoId));
    for (const repo of repositories) {
      // Like the Prisma upsert: id, settings and createdAt survive a resync.
      const existing = this.repositories.get(repo.githubRepoId);
      this.repositories.set(repo.githubRepoId, {
        ...repo,
        id: existing?.id ?? randomUUID(),
        settings: existing?.settings ?? {},
        createdAt: existing?.createdAt ?? now,
        installationId: installation.installationId,
        removedAt: null,
      });
    }
    for (const repo of this.repositories.values()) {
      if (
        repo.installationId === installation.installationId &&
        !current.has(repo.githubRepoId) &&
        !repo.removedAt
      ) {
        repo.removedAt = now;
      }
    }
  }

  private requireRecord(installationId: number): InstallationRecord {
    const record = this.toRecord(installationId);
    if (!record) throw new Error(`Installation ${String(installationId)} not found`);
    return record;
  }

  private toRecord(installationId: number): InstallationRecord | null {
    const installation = this.installations.get(installationId);
    if (!installation) return null;
    return { ...installation, repositoryCount: this.activeRepositoryIds(installationId).length };
  }
}
