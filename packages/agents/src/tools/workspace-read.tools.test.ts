import { beforeEach, describe, expect, it } from 'vitest';

import { MemoryEventSink } from '../ports/events.port.js';
import { EMPTY_BUDGET } from '../state/agent-state.js';
import { InMemoryWorkspace } from '../testing/in-memory-workspace.js';
import { ToolExecutor } from './tool-executor.js';
import { ToolRegistry } from './tool-registry.js';
import { MAX_LINES_PER_READ } from './workspace-read.tools.js';
import { createWorkspaceReadTools } from './workspace-read.tools.js';

const bigFile = Array.from({ length: 1_000 }, (_, i) => `line ${String(i + 1)}`).join('\n');

const workspace = new InMemoryWorkspace({
  'src/checkout/checkout.service.ts': 'export function total() {\n  return 1;\n}',
  'src/checkout/checkout.controller.ts': '// calls total()',
  'src/big.ts': bigFile,
  'README.md': '# Shop',
  '.env': 'SECRET=1',
});

let executor: ToolExecutor;
const run = (name: string, input: unknown) =>
  executor.execute({ id: 'c1', name, input }, { role: 'investigator', budget: EMPTY_BUDGET });

beforeEach(() => {
  executor = new ToolExecutor({
    registry: new ToolRegistry(createWorkspaceReadTools(workspace)),
    limits: { maxLlmCalls: 10, maxToolCalls: 50, maxCostUsd: 1 },
    events: new MemoryEventSink(),
  });
});

describe('workspace read tools (through the policy chain)', () => {
  it('lists a directory, marking subdirectories', async () => {
    const { result } = await run('list_files', { path: '' });

    expect(result.content).toContain('src/');
    expect(result.content).toContain('README.md');
  });

  it('reads a file with line numbers, wrapped as untrusted data', async () => {
    const { result } = await run('read_file', {
      path: 'src/checkout/checkout.service.ts',
      startLine: null,
      endLine: null,
    });

    expect(result.content).toBe(
      '<untrusted_file source="src/checkout/checkout.service.ts:1-3">\n1 | export function total() {\n2 |   return 1;\n3 | }\n</untrusted_file>',
    );
  });

  it(`reads large files in ranges of at most ${String(MAX_LINES_PER_READ)} lines`, async () => {
    const { result } = await run('read_file', {
      path: 'src/big.ts',
      startLine: 900,
      endLine: null,
    });

    expect(result.content).toContain('900 | line 900');
    expect(result.content).toContain('1000 | line 1000');

    const first = await run('read_file', { path: 'src/big.ts', startLine: null, endLine: null });
    expect(first.result.content).toContain(
      `(showing lines 1-${String(MAX_LINES_PER_READ)} of 1000)`,
    );
  });

  it('searches case-insensitively and reports path:line', async () => {
    const { result } = await run('search_code', { query: 'TOTAL()', path: 'src' });

    expect(result.content).toContain('src/checkout/checkout.controller.ts:1: // calls total()');
  });

  it('reports a missing file to the model instead of failing the run', async () => {
    const { result } = await run('read_file', {
      path: 'src/nope.ts',
      startLine: null,
      endLine: null,
    });

    expect(result).toMatchObject({ isError: true, content: 'Not found: src/nope.ts' });
  });

  it('never reads secrets, even though the file exists', async () => {
    const { result } = await run('read_file', { path: '.env', startLine: null, endLine: null });

    expect(result.isError).toBe(true);
    expect(result.content).not.toContain('SECRET');
  });
});
