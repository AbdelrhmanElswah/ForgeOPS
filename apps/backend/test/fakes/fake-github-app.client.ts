import { NotFoundError, UnauthenticatedError } from '../../src/common/errors/domain-error.js';
import {
  GitHubAppClient,
  type GitHubBranchInfo,
  type GitHubInstallationInfo,
  type GitHubRepositoryInfo,
  type GitHubUserIdentity,
  InstallationAccessDeniedError,
  type ScopedToken,
} from '../../src/modules/github/application/github-app.client.js';
import type { InstallationSnapshot } from '../../src/modules/github/application/installations.repository.js';
import { isValidWebhookSignature } from '../../src/modules/github/application/webhook-signature.js';

export const FAKE_WEBHOOK_SECRET = 'fake-webhook-secret-for-tests';
export const FAKE_APP_SLUG = 'forgeops-test';

/**
 * A scriptable stand-in for GitHub. Tests describe the world ("installation 42 has these
 * repos", "OAuth code X belongs to user Y who can access installation 42") and the fake
 * answers like GitHub would, including refusals.
 */
export class FakeGitHubAppClient extends GitHubAppClient {
  readonly installations = new Map<
    number,
    { installation: GitHubInstallationInfo; repositories: GitHubRepositoryInfo[] }
  >();
  readonly oauthCodes = new Map<string, { user: GitHubUserIdentity; installationIds: number[] }>();

  /** Convenience for tests: registers an installation with `repoCount` repositories. */
  addInstallation(installationId: number, accountLogin: string, repoIds: number[]): void {
    this.installations.set(installationId, {
      installation: { installationId, accountLogin, accountType: 'User', suspended: false },
      repositories: repoIds.map((id) => ({
        githubRepoId: id,
        owner: accountLogin,
        name: `repo-${id}`,
        defaultBranch: 'main',
        isPrivate: false,
      })),
    });
  }

  /** What GitHub currently reports for an installation (for seeding repositories in tests). */
  snapshot(installationId: number): InstallationSnapshot {
    const entry = this.installations.get(installationId);
    if (!entry) throw new Error(`Fake GitHub has no installation ${String(installationId)}`);
    return { installation: entry.installation, repositories: [...entry.repositories] };
  }

  getInstallation(installationId: number): Promise<GitHubInstallationInfo> {
    const entry = this.installations.get(installationId);
    return entry
      ? Promise.resolve(entry.installation)
      : Promise.reject(new NotFoundError('GitHub resource'));
  }

  listInstallationRepositories(installationId: number): Promise<GitHubRepositoryInfo[]> {
    return Promise.resolve(this.installations.get(installationId)?.repositories ?? []);
  }

  listBranches(): Promise<GitHubBranchInfo[]> {
    return Promise.resolve([{ name: 'main', commitSha: 'a'.repeat(40), isProtected: false }]);
  }

  getBranchHead(): Promise<string> {
    return Promise.resolve('a'.repeat(40));
  }

  createScopedToken(): Promise<ScopedToken> {
    return Promise.resolve({ token: 'ghs_fake', expiresAt: new Date(Date.now() + 3_600_000) });
  }

  installationUrl(state: string): string {
    return `https://github.com/apps/${FAKE_APP_SLUG}/installations/new?state=${encodeURIComponent(state)}`;
  }

  authorizeInstallation(code: string, installationId: number): Promise<GitHubUserIdentity> {
    const grant = this.oauthCodes.get(code);
    this.oauthCodes.delete(code); // OAuth codes are single-use on GitHub too
    if (!grant) {
      return Promise.reject(new UnauthenticatedError('The GitHub authorization code is invalid.'));
    }
    if (!grant.installationIds.includes(installationId)) {
      return Promise.reject(new InstallationAccessDeniedError());
    }
    return Promise.resolve(grant.user);
  }

  isValidWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    return isValidWebhookSignature(FAKE_WEBHOOK_SECRET, rawBody, signatureHeader);
  }
}
