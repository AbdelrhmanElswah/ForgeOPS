import type { GitHubInstallationInfo, GitHubRepositoryInfo } from './github-app.client.js';

export interface InstallationRecord {
  id: string;
  installationId: number;
  userId: string;
  accountLogin: string;
  accountType: 'User' | 'Organization';
  suspendedAt: Date | null;
  removedAt: Date | null;
  /** Repositories currently accessible (not removed). */
  repositoryCount: number;
  createdAt: Date;
}

/** What GitHub says right now about an installation and the repositories it grants. */
export interface InstallationSnapshot {
  installation: GitHubInstallationInfo;
  repositories: GitHubRepositoryInfo[];
}

/** Port for persisted installations and their repositories. */
export abstract class InstallationsRepository {
  abstract findByInstallationId(installationId: number): Promise<InstallationRecord | null>;

  /**
   * Creates or refreshes the installation as owned by `userId`, then reconciles repositories:
   * new ones are added, known ones updated (renames, default branch), and ones no longer in the
   * snapshot are marked removed. Idempotent: saving the same snapshot twice changes nothing.
   */
  abstract saveForUser(
    userId: string,
    snapshot: InstallationSnapshot,
    now: Date,
  ): Promise<InstallationRecord>;

  /** Same reconciliation for an installation we already know. Returns false if it's unknown. */
  abstract refresh(snapshot: InstallationSnapshot, now: Date): Promise<boolean>;

  abstract setSuspended(installationId: number, suspendedAt: Date | null): Promise<void>;

  /** The app was uninstalled: mark the installation and all its repositories removed. */
  abstract markRemoved(installationId: number, now: Date): Promise<void>;

  abstract listForUser(userId: string): Promise<InstallationRecord[]>;
}
