import { GitHubAppClient, GitHubNotConfiguredError } from '../application/github-app.client.js';

/**
 * Null Object: stands in when no GitHub App is configured. The server still boots and every
 * non-GitHub feature works; GitHub calls fail with a clear 503 instead of a null crash.
 */
export class UnconfiguredGitHubAppClient extends GitHubAppClient {
  getInstallation(): Promise<never> {
    return Promise.reject(new GitHubNotConfiguredError());
  }
  listInstallationRepositories(): Promise<never> {
    return Promise.reject(new GitHubNotConfiguredError());
  }
  listBranches(): Promise<never> {
    return Promise.reject(new GitHubNotConfiguredError());
  }
  getBranchHead(): Promise<never> {
    return Promise.reject(new GitHubNotConfiguredError());
  }
  createScopedToken(): Promise<never> {
    return Promise.reject(new GitHubNotConfiguredError());
  }
}
