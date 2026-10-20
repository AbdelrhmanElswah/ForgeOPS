/**
 * Port: read access to the task's checked-out repository (the sandbox workspace).
 * Paths arrive already checked and normalised by PathGuard; the adapter (Phase 3) adds the
 * filesystem-level checks a string can't express (symlinks resolving outside the workspace).
 */
export interface WorkspaceReader {
  /** Direct children of a directory ('' is the repository root). */
  listDirectory(path: string): Promise<WorkspaceEntry[]>;
  /** Whole file as text. Throws WorkspaceNotFoundError for a missing file or a directory. */
  readFile(path: string): Promise<string>;
  /** Literal, case-insensitive search under `path`, at most `maxResults` matches. */
  search(query: string, options: { path: string; maxResults: number }): Promise<SearchMatch[]>;
}

export interface WorkspaceEntry {
  name: string;
  type: 'file' | 'directory';
}

export interface SearchMatch {
  path: string;
  /** 1-based. */
  line: number;
  text: string;
}

export class WorkspaceNotFoundError extends Error {
  constructor(readonly path: string) {
    super(`No such file: ${path}`);
    this.name = 'WorkspaceNotFoundError';
  }
}
