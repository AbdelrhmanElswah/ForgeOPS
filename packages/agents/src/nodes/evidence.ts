import type { Findings } from '../outputs/findings.js';
import type { PathGuard } from '../policies/path-guard.js';
import type { WorkspaceReader } from '../ports/workspace.port.js';

/**
 * Checks the investigator's citations against the real files. A model can state a file and
 * line range confidently and still be wrong; deterministic code verifies the claim instead
 * of trusting it. Returns human-readable problems (empty when everything checks out).
 */
export async function findEvidenceProblems(
  findings: Findings,
  workspace: WorkspaceReader,
  guard: PathGuard,
): Promise<string[]> {
  const problems: string[] = [];
  const lineCounts = new Map<string, number | null>();

  const lineCount = async (path: string): Promise<number | null> => {
    if (!lineCounts.has(path)) {
      const content = await workspace.readFile(path).catch(() => null);
      lineCounts.set(path, content === null ? null : content.split('\n').length);
    }
    return lineCounts.get(path) ?? null;
  };

  for (const item of findings.evidence) {
    const checked = guard.check(item.path, 'read');
    if (!checked.ok) {
      problems.push(`evidence ${item.path}: ${checked.reason}`);
      continue;
    }
    const lines = await lineCount(checked.path);
    if (lines === null) {
      problems.push(`evidence ${item.path}: the file does not exist.`);
    } else if (item.startLine > item.endLine) {
      problems.push(`evidence ${item.path}: startLine is after endLine.`);
    } else if (item.endLine > lines) {
      problems.push(
        `evidence ${item.path}: lines ${String(item.startLine)}-${String(item.endLine)} are outside the file (${String(lines)} lines).`,
      );
    }
  }

  // Catch a plan to edit protected files now, not after an implementation attempt.
  for (const path of findings.filesToChange) {
    const checked = guard.check(path, 'write');
    if (!checked.ok) {
      problems.push(`filesToChange ${path}: ${checked.reason}`);
    }
  }
  return problems;
}
