import { z } from 'zod';

import { wrapUntrusted } from '../policies/untrusted-content.js';
import { type WorkspaceReader, WorkspaceNotFoundError } from '../ports/workspace.port.js';
import { type AgentTool, defineTool, ToolError } from './tool.js';

/** Enough to understand a function and its neighbours; bigger files are read in ranges. */
export const MAX_LINES_PER_READ = 400;
const MAX_SEARCH_RESULTS = 50;
const MAX_DIRECTORY_ENTRIES = 200;

const READ_ROLES = ['investigator', 'implementer'] as const;

/**
 * Read-only tools over the workspace. Everything they return is repository content, so it is
 * wrapped as untrusted data before the model sees it (prompt-injection defence).
 */
export function createWorkspaceReadTools(workspace: WorkspaceReader): AgentTool[] {
  const listFiles = defineTool({
    name: 'list_files',
    description:
      'List the files and directories directly inside a directory. Use "" for the repository root.',
    input: z.strictObject({ path: z.string() }),
    roles: READ_ROLES,
    pathFields: [{ field: 'path', access: 'read' }],
    execute: async ({ path }) => {
      const entries = await notFoundAsToolError(path, () => workspace.listDirectory(path));
      const shown = entries
        .slice(0, MAX_DIRECTORY_ENTRIES)
        .map((entry) => (entry.type === 'directory' ? `${entry.name}/` : entry.name));
      const more =
        entries.length > shown.length
          ? `\n(${String(entries.length - shown.length)} more not shown)`
          : '';
      return wrapUntrusted('output', `ls ${path || '.'}`, shown.join('\n') + more);
    },
  });

  const readFile = defineTool({
    name: 'read_file',
    description: `Read a file with line numbers. Pass startLine/endLine to read part of it (at most ${String(MAX_LINES_PER_READ)} lines per call); use null to start at the top.`,
    input: z.strictObject({
      path: z.string(),
      startLine: z.number().int().min(1).nullable(),
      endLine: z.number().int().min(1).nullable(),
    }),
    roles: READ_ROLES,
    pathFields: [{ field: 'path', access: 'read' }],
    execute: async ({ path, startLine, endLine }) => {
      const lines = (await notFoundAsToolError(path, () => workspace.readFile(path))).split('\n');
      const start = startLine ?? 1;
      if (start > lines.length) {
        throw new ToolError(`${path} has only ${String(lines.length)} lines.`);
      }
      const end = Math.min(endLine ?? lines.length, lines.length, start + MAX_LINES_PER_READ - 1);
      if (end < start) {
        throw new ToolError('endLine must not be before startLine.');
      }
      const width = String(end).length;
      const numbered = lines
        .slice(start - 1, end)
        .map((text, index) => `${String(start + index).padStart(width)} | ${text}`)
        .join('\n');
      const note =
        end < lines.length
          ? `\n(showing lines ${String(start)}-${String(end)} of ${String(lines.length)})`
          : '';
      return wrapUntrusted('file', `${path}:${String(start)}-${String(end)}`, numbered + note);
    },
  });

  const searchCode = defineTool({
    name: 'search_code',
    description:
      'Find a literal text (case-insensitive) in files under a directory. Returns path:line: text for each match.',
    input: z.strictObject({ query: z.string().min(2).max(200), path: z.string() }),
    roles: READ_ROLES,
    pathFields: [{ field: 'path', access: 'read' }],
    execute: async ({ query, path }) => {
      const matches = await workspace.search(query, { path, maxResults: MAX_SEARCH_RESULTS + 1 });
      if (matches.length === 0) {
        return `No matches for "${query}".`;
      }
      const shown = matches
        .slice(0, MAX_SEARCH_RESULTS)
        .map((match) => `${match.path}:${String(match.line)}: ${match.text.trim()}`);
      const more =
        matches.length > MAX_SEARCH_RESULTS ? '\n(more matches not shown: narrow the search)' : '';
      return wrapUntrusted('output', `search "${query}"`, shown.join('\n') + more);
    },
  });

  return [listFiles, readFile, searchCode];
}

async function notFoundAsToolError<T>(path: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) {
      throw new ToolError(`Not found: ${path || '.'}`);
    }
    throw error;
  }
}
