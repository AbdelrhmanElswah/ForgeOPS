import { DomainError } from '../../../common/errors/domain-error.js';

// GitHub ids are JS numbers here: they exceed 32 bits but stay far below 2^53, so they are
// exact. They become BigInt only at the database boundary (Prisma).

export interface GitHubInstallationInfo {
  installationId: number;
  accountLogin: string;
  accountType: 'User' | 'Organization';
  suspended: boolean;
}

export interface GitHubRepositoryInfo {
  githubRepoId: number;
  owner: string;
  name: string;
  defaultBranch: string;
  isPrivate: boolean;
}

export interface GitHubBranchInfo {
  name: string;
  commitSha: string;
  isProtected: boolean;
}

type Access = 'read' | 'write';

/**
 * What a token may do. Every caller states it explicitly, so least privilege is the default.
 * GitHub enforces it: a `contents: read` token simply cannot push.
 */
export interface TokenScope {
  repositoryIds: [number, ...number[]];
  permissions: Partial<Record<'contents' | 'pull_requests' | 'metadata', Access>>;
}

/** Narrow scopes used across the app, named after the job that needs them. */
export const TOKEN_SCOPES = {
  clone: (repositoryId: number): TokenScope => ({
    repositoryIds: [repositoryId],
    permissions: { contents: 'read', metadata: 'read' },
  }),
  publish: (repositoryId: number): TokenScope => ({
    repositoryIds: [repositoryId],
    permissions: { contents: 'write', pull_requests: 'write', metadata: 'read' },
  }),
};

export interface ScopedToken {
  /** A secret: pass it straight to the one consumer that needs it, never log or persist it. */
  token: string;
  expiresAt: Date;
}

export class GitHubNotConfiguredError extends DomainError {
  readonly code = 'service_unavailable';

  constructor() {
    super('The GitHub integration is not configured on this server.');
  }
}

/**
 * Port: everything ForgeOps needs from GitHub, in our own vocabulary. The Octokit adapter
 * implements it; tests and the "not configured" mode substitute their own implementations.
 */
export abstract class GitHubAppClient {
  abstract getInstallation(installationId: number): Promise<GitHubInstallationInfo>;
  abstract listInstallationRepositories(installationId: number): Promise<GitHubRepositoryInfo[]>;
  abstract listBranches(
    installationId: number,
    owner: string,
    repo: string,
  ): Promise<GitHubBranchInfo[]>;
  abstract getBranchHead(
    installationId: number,
    owner: string,
    repo: string,
    branch: string,
  ): Promise<string>;
  /** Mints (or reuses a cached) installation token narrowed to `scope`. */
  abstract createScopedToken(installationId: number, scope: TokenScope): Promise<ScopedToken>;
}
