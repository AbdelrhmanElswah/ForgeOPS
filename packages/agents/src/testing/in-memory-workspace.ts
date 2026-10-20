import {
  type SearchMatch,
  type WorkspaceEntry,
  WorkspaceNotFoundError,
  type WorkspaceReader,
} from '../ports/workspace.port.js';

/** A repository held in a plain object: `{ 'src/a.ts': 'contents' }`. For tests and evals. */
export class InMemoryWorkspace implements WorkspaceReader {
  readonly reads: string[] = [];

  constructor(private readonly files: Record<string, string>) {}

  listDirectory(path: string): Promise<WorkspaceEntry[]> {
    const prefix = path === '' ? '' : `${path}/`;
    const entries = new Map<string, WorkspaceEntry>();
    for (const file of Object.keys(this.files)) {
      if (!file.startsWith(prefix)) continue;
      const [name = '', ...rest] = file.slice(prefix.length).split('/');
      entries.set(name, { name, type: rest.length > 0 ? 'directory' : 'file' });
    }
    if (entries.size === 0 && path !== '') {
      return Promise.reject(new WorkspaceNotFoundError(path));
    }
    return Promise.resolve([...entries.values()].sort((a, b) => a.name.localeCompare(b.name)));
  }

  readFile(path: string): Promise<string> {
    this.reads.push(path);
    const content = this.files[path];
    return content === undefined
      ? Promise.reject(new WorkspaceNotFoundError(path))
      : Promise.resolve(content);
  }

  search(
    query: string,
    { path, maxResults }: { path: string; maxResults: number },
  ): Promise<SearchMatch[]> {
    const needle = query.toLowerCase();
    const prefix = path === '' ? '' : `${path}/`;
    const matches: SearchMatch[] = [];
    for (const [file, content] of Object.entries(this.files).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (!file.startsWith(prefix)) continue;
      content.split('\n').forEach((text, index) => {
        if (matches.length < maxResults && text.toLowerCase().includes(needle)) {
          matches.push({ path: file, line: index + 1, text });
        }
      });
    }
    return Promise.resolve(matches);
  }
}
