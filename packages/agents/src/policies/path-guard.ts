import { posix } from 'node:path';

import picomatch from 'picomatch';

export type PathAccess = 'read' | 'write';

export type PathCheck = { ok: true; path: string } | { ok: false; reason: string };

/**
 * Never readable: secrets and git internals. Reading `.env` and writing its contents into
 * a file would leak it through the pull request, so it is blocked at the source.
 */
const DENY_READ = [
  '.git/**',
  '**/.env',
  '**/.env.*',
  '**/*.pem',
  '**/*.key',
  '**/id_rsa*',
  '**/id_ed25519*',
  '**/.npmrc',
  '**/secrets/**',
];

/** Never writable, on top of DENY_READ: CI config (could exfiltrate secrets) and lockfiles. */
const DENY_WRITE = [
  ...DENY_READ,
  '.github/workflows/**',
  '.github/actions/**',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/node_modules/**',
];

const MAX_PATH_LENGTH = 500;

/**
 * Lexical checks on a repository-relative path proposed by the model.
 *
 * This is the first of two layers. It rejects anything that tries to leave the workspace
 * (`..`, absolute paths, drive letters) or touch denied files, before any filesystem access.
 * The second layer lives in the workspace adapter (Phase 3): it resolves the real path and
 * rejects symlinks that point outside the workspace, which no string check can detect.
 *
 * Matching is case-insensitive, so `.ENV` can't slip past a rule written for `.env`.
 */
export class PathGuard {
  private readonly denyRead: picomatch.Matcher;
  private readonly denyWrite: picomatch.Matcher;

  /** @param extraDeniedPaths repository settings `deniedPaths` (apply to read and write) */
  constructor(extraDeniedPaths: readonly string[] = []) {
    const options = { dot: true, nocase: true };
    this.denyRead = picomatch([...DENY_READ, ...extraDeniedPaths], options);
    this.denyWrite = picomatch([...DENY_WRITE, ...extraDeniedPaths], options);
  }

  check(rawPath: string, access: PathAccess): PathCheck {
    if (rawPath.length === 0 || rawPath.length > MAX_PATH_LENGTH) {
      return { ok: false, reason: 'Path is empty or too long.' };
    }
    if (/[\0\r\n]/.test(rawPath)) {
      return { ok: false, reason: 'Path contains control characters.' };
    }
    // Backslashes would be separators on Windows but ordinary characters on Linux;
    // refusing them keeps one unambiguous meaning everywhere.
    if (rawPath.includes('\\')) {
      return { ok: false, reason: 'Use forward slashes in paths.' };
    }
    if (rawPath.startsWith('/') || /^[a-zA-Z]:/.test(rawPath)) {
      return { ok: false, reason: 'Paths must be relative to the repository root.' };
    }

    const normalized = posix.normalize(rawPath).replace(/\/+$/, '');
    if (normalized === '..' || normalized.startsWith('../')) {
      return { ok: false, reason: 'Path leaves the repository.' };
    }
    const path = normalized === '.' ? '' : normalized;

    const denied = access === 'write' ? this.denyWrite : this.denyRead;
    if (path !== '' && denied(path)) {
      return { ok: false, reason: `Access to "${path}" is not allowed (${access}).` };
    }
    return { ok: true, path };
  }
}
