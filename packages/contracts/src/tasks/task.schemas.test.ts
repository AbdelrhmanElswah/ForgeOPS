import { describe, expect, it } from 'vitest';

import { isTerminalStatus } from './task-status.js';
import { CreateTaskRequestSchema, ListTasksQuerySchema } from './task.schemas.js';

const repositoryId = '0192f0c4-7a3e-7c1d-9b2a-5e6f7a8b9c0d';

describe('CreateTaskRequestSchema', () => {
  it('accepts a valid request and trims the instruction', () => {
    const result = CreateTaskRequestSchema.parse({
      repositoryId,
      instruction: '  Fix the checkout bug and add regression tests  ',
      baseBranch: 'main',
    });

    expect(result.instruction).toBe('Fix the checkout bug and add regression tests');
  });

  it('makes baseBranch optional', () => {
    const result = CreateTaskRequestSchema.safeParse({
      repositoryId,
      instruction: 'Fix the checkout bug',
    });

    expect(result.success).toBe(true);
  });

  it('rejects unknown keys so clients cannot smuggle fields like status', () => {
    const result = CreateTaskRequestSchema.safeParse({
      repositoryId,
      instruction: 'Fix the checkout bug',
      status: 'completed',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a too-short instruction', () => {
    const result = CreateTaskRequestSchema.safeParse({ repositoryId, instruction: 'fix' });

    expect(result.success).toBe(false);
  });
});

describe('ListTasksQuerySchema', () => {
  it('coerces limit from a query string and applies defaults', () => {
    expect(ListTasksQuerySchema.parse({ limit: '50' }).limit).toBe(50);
    expect(ListTasksQuerySchema.parse({}).limit).toBe(20);
  });

  it('caps the page size', () => {
    expect(ListTasksQuerySchema.safeParse({ limit: '1000' }).success).toBe(false);
  });
});

describe('isTerminalStatus', () => {
  it('distinguishes terminal from in-flight statuses', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('cancelled')).toBe(true);
    expect(isTerminalStatus('awaiting_approval')).toBe(false);
  });
});
