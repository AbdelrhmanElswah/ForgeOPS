import { App, Octokit, RequestError } from 'octokit';
import { z } from 'zod';

import { NotFoundError } from '../../../common/errors/domain-error.js';
import {
  GitHubAppClient,
  type GitHubBranchInfo,
  type GitHubInstallationInfo,
  type GitHubRepositoryInfo,
  type ScopedToken,
  type TokenScope,
} from '../application/github-app.client.js';
import type { GitHubAppCredentials } from './github-app.credentials.js';

const InstallationTokenSchema = z.object({ token: z.string(), expiresAt: z.string() });

/**
 * Adapter: implements the GitHubAppClient port with Octokit.
 *
 * Authentication is layered, all handled by `@octokit/auth-app` inside `App`:
 *   private key ──signs──▶ app JWT (10 min) ──exchanges──▶ installation token (1 h, cached)
 * Tokens are cached per (installation, repositories, permissions) and refreshed shortly
 * before they expire, so callers can ask for one per operation without hammering GitHub.
 */
export class OctokitGitHubAppClient extends GitHubAppClient {
  private readonly app: App;

  constructor(credentials: GitHubAppCredentials) {
    super();
    this.app = new App({
      appId: credentials.appId,
      privateKey: credentials.privateKey,
      webhooks: { secret: credentials.webhookSecret },
      Octokit: Octokit.defaults({ userAgent: 'forgeops' }),
    });
  }

  async getInstallation(installationId: number): Promise<GitHubInstallationInfo> {
    // Authenticated as the app itself (JWT), because this is a question *about* an installation.
    const { data } = await this.call(() =>
      this.app.octokit.request('GET /app/installations/{installation_id}', {
        installation_id: installationId,
      }),
    );
    const account = data.account as { login?: string; slug?: string } | null;
    return {
      installationId: data.id,
      accountLogin: account?.login ?? account?.slug ?? 'unknown',
      accountType: data.target_type === 'Organization' ? 'Organization' : 'User',
      suspended: data.suspended_at !== null,
    };
  }

  async listInstallationRepositories(installationId: number): Promise<GitHubRepositoryInfo[]> {
    const octokit = await this.app.getInstallationOctokit(installationId);
    const repositories = await this.call(() =>
      octokit.paginate('GET /installation/repositories', { per_page: 100 }),
    );
    return repositories.map((repo) => ({
      githubRepoId: repo.id,
      owner: repo.owner.login,
      name: repo.name,
      defaultBranch: repo.default_branch,
      isPrivate: repo.private,
    }));
  }

  async listBranches(
    installationId: number,
    owner: string,
    repo: string,
  ): Promise<GitHubBranchInfo[]> {
    const octokit = await this.app.getInstallationOctokit(installationId);
    const branches = await this.call(() =>
      octokit.paginate('GET /repos/{owner}/{repo}/branches', { owner, repo, per_page: 100 }),
    );
    return branches.map((branch) => ({
      name: branch.name,
      commitSha: branch.commit.sha,
      isProtected: branch.protected,
    }));
  }

  async getBranchHead(
    installationId: number,
    owner: string,
    repo: string,
    branch: string,
  ): Promise<string> {
    const octokit = await this.app.getInstallationOctokit(installationId);
    const { data } = await this.call(() =>
      octokit.request('GET /repos/{owner}/{repo}/branches/{branch}', { owner, repo, branch }),
    );
    return data.commit.sha;
  }

  async createScopedToken(installationId: number, scope: TokenScope): Promise<ScopedToken> {
    const authentication: unknown = await this.call(() =>
      this.app.octokit.auth({
        type: 'installation',
        installationId,
        repositoryIds: scope.repositoryIds,
        permissions: scope.permissions,
      }),
    );
    const { token, expiresAt } = InstallationTokenSchema.parse(authentication);
    return { token, expiresAt: new Date(expiresAt) };
  }

  /** Translates GitHub's HTTP errors into domain errors at the boundary. */
  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof RequestError && error.status === 404) {
        throw new NotFoundError('GitHub resource');
      }
      throw error;
    }
  }
}
