import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { BudgetExceededError } from '../policies/budget.js';
import { MemoryEventSink } from '../ports/events.port.js';
import { EMPTY_BUDGET } from '../state/agent-state.js';
import { defineTool, ToolError } from './tool.js';
import { ToolExecutor } from './tool-executor.js';
import { ToolRegistry } from './tool-registry.js';

const readPaths: string[] = [];

const readFile = defineTool({
  name: 'read_file',
  description: 'Read a file',
  input: z.strictObject({ path: z.string() }),
  roles: ['investigator', 'implementer'],
  pathFields: [{ field: 'path', access: 'read' }],
  execute: ({ path }) => {
    readPaths.push(path);
    if (path === 'missing.ts') throw new ToolError('File not found: missing.ts');
    if (path === 'crash.ts') throw new Error('EACCES /home/runner/secret-path');
    return Promise.resolve(path === 'big.ts' ? 'x'.repeat(5_000) : `contents of ${path}`);
  },
});

const editFile = defineTool({
  name: 'edit_file',
  description: 'Edit a file',
  input: z.strictObject({ path: z.string(), replacement: z.string() }),
  roles: ['implementer'],
  pathFields: [{ field: 'path', access: 'write' }],
  execute: () => Promise.resolve('edited'),
});

const slow = defineTool({
  name: 'slow_tool',
  description: 'Never finishes on its own',
  input: z.strictObject({}),
  roles: ['investigator'],
  execute: () => new Promise<string>(() => undefined),
});

const limits = { maxLlmCalls: 10, maxToolCalls: 5, maxCostUsd: 1 };
let events: MemoryEventSink;
let executor: ToolExecutor;

const call = (name: string, input: unknown) => ({ id: 'call-1', name, input });
const investigator = { role: 'investigator' as const, budget: EMPTY_BUDGET };

beforeEach(() => {
  readPaths.length = 0;
  events = new MemoryEventSink();
  executor = new ToolExecutor({
    registry: new ToolRegistry([readFile, editFile, slow]),
    limits,
    events,
    maxOutputChars: 1_000,
    timeoutMs: 50,
  });
});

describe('ToolExecutor', () => {
  it('runs an allowed call and reports it', async () => {
    const outcome = await executor.execute(call('read_file', { path: 'src/a.ts' }), investigator);

    expect(outcome.result).toEqual({
      type: 'tool_result',
      toolCallId: 'call-1',
      content: 'contents of src/a.ts',
    });
    expect(outcome.budgetDelta).toEqual({ toolCalls: 1 });
    expect(events.events).toEqual([
      expect.objectContaining({ type: 'tool.called', tool: 'read_file', ok: true }),
    ]);
  });

  it('hands the tool the normalised path, never the raw one', async () => {
    await executor.execute(call('read_file', { path: './src/../src/a.ts' }), investigator);

    expect(readPaths).toEqual(['src/a.ts']);
  });

  describe('model mistakes come back as error results (the model can correct itself)', () => {
    it.each([
      ['an unknown tool', call('rm_rf', {}), /Unknown tool/],
      [
        'a tool outside the role',
        call('edit_file', { path: 'a.ts', replacement: '' }),
        /not available/,
      ],
      ['missing arguments', call('read_file', {}), /Invalid arguments.*path/],
      [
        'smuggled extra arguments',
        call('read_file', { path: 'a.ts', shell: 'curl' }),
        /Invalid arguments/,
      ],
      ['a path escape', call('read_file', { path: '../../etc/passwd' }), /leaves the repository/],
      ['a secret file', call('read_file', { path: '.env' }), /not allowed/],
    ])('%s', async (_case, toolCall, message) => {
      const outcome = await executor.execute(toolCall, investigator);

      expect(outcome.result.isError).toBe(true);
      expect(outcome.result.content).toMatch(message);
      expect(readPaths).toEqual([]); // nothing ran
      expect(events.events[0]).toMatchObject({ ok: false });
    });

    it('passes a ToolError message through', async () => {
      const outcome = await executor.execute(
        call('read_file', { path: 'missing.ts' }),
        investigator,
      );

      expect(outcome.result).toMatchObject({
        isError: true,
        content: 'File not found: missing.ts',
      });
    });

    it('hides the details of an unexpected failure', async () => {
      const outcome = await executor.execute(call('read_file', { path: 'crash.ts' }), investigator);

      expect(outcome.result.content).toBe('The tool failed unexpectedly.');
      expect(outcome.result.content).not.toContain('/home/runner');
    });

    it('times out a tool that never returns', async () => {
      const outcome = await executor.execute(call('slow_tool', {}), investigator);

      expect(outcome.result).toMatchObject({
        isError: true,
        content: expect.stringMatching(/timed out/) as string,
      });
    });
  });

  describe('hard stops throw (the run ends, whatever the model wants)', () => {
    it('refuses a call that would exceed the tool budget, before running it', async () => {
      await expect(
        executor.execute(call('read_file', { path: 'a.ts' }), {
          ...investigator,
          budget: { ...EMPTY_BUDGET, toolCalls: 5 },
        }),
      ).rejects.toBeInstanceOf(BudgetExceededError);
      expect(readPaths).toEqual([]);
    });

    it('counts rejected calls against the budget too', async () => {
      const outcome = await executor.execute(call('rm_rf', {}), investigator);

      expect(outcome.budgetDelta).toEqual({ toolCalls: 1 });
    });

    it('stops on cancellation', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        executor.execute(call('read_file', { path: 'a.ts' }), {
          ...investigator,
          signal: controller.signal,
        }),
      ).rejects.toThrow();
    });
  });

  it('truncates large output', async () => {
    const outcome = await executor.execute(call('read_file', { path: 'big.ts' }), investigator);

    expect(outcome.result.content.length).toBeLessThanOrEqual(1_000);
    expect(outcome.result.content).toContain('characters omitted');
  });
});

describe('ToolExecutor timeouts', () => {
  it('aborts the timed-out tool’s signal, so its work stops instead of running on', async () => {
    let seenSignal: AbortSignal | undefined;
    const hanging = defineTool({
      name: 'hanging_tool',
      description: 'Waits forever',
      input: z.strictObject({}),
      roles: ['investigator'],
      execute: (_input, { signal }) => {
        seenSignal = signal;
        return new Promise<string>(() => undefined);
      },
    });
    const timed = new ToolExecutor({
      registry: new ToolRegistry([hanging]),
      limits,
      events: new MemoryEventSink(),
      timeoutMs: 20,
    });

    await timed.execute(call('hanging_tool', {}), investigator);

    expect(seenSignal?.aborted).toBe(true);
  });
});

describe('ToolRegistry', () => {
  it('shows each role only its own tools, in a stable order', () => {
    const registry = new ToolRegistry([readFile, editFile, slow]);

    expect(registry.definitionsFor('investigator').map((t) => t.name)).toEqual([
      'read_file',
      'slow_tool',
    ]);
    expect(registry.definitionsFor('implementer').map((t) => t.name)).toEqual([
      'edit_file',
      'read_file',
    ]);
    expect(registry.definitionsFor('planner')).toEqual([]);
  });

  it('rejects duplicate or badly named tools', () => {
    expect(() => new ToolRegistry([readFile, readFile])).toThrow(/twice/);
    expect(() => new ToolRegistry([{ ...readFile, name: 'Read File' }])).toThrow(
      /Invalid tool name/,
    );
  });
});
