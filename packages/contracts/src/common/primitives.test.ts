import { describe, expect, it } from 'vitest';

import { CommitShaSchema, GitRefNameSchema, IdempotencyKeySchema } from './primitives.js';

describe('GitRefNameSchema', () => {
  it.each(['main', 'release/1.2', 'forgeops/task-0192', 'feature_x.y'])('accepts %s', (ref) => {
    expect(GitRefNameSchema.safeParse(ref).success).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['option injection', '--upload-pack=evil'],
    ['parent traversal', 'feature/../main'],
    ['shell metacharacters', 'main; rm -rf /'],
    ['spaces', 'my branch'],
    ['leading slash', '/main'],
    ['trailing slash', 'main/'],
    ['lock suffix', 'main.lock'],
    ['hidden component', 'feature/.hidden'],
  ])('rejects %s', (_case, ref) => {
    expect(GitRefNameSchema.safeParse(ref).success).toBe(false);
  });
});

describe('CommitShaSchema', () => {
  it('accepts a full lowercase SHA', () => {
    expect(CommitShaSchema.safeParse('a'.repeat(40)).success).toBe(true);
  });

  it.each(['abc1234', 'A'.repeat(40), 'g'.repeat(40)])('rejects %s', (sha) => {
    expect(CommitShaSchema.safeParse(sha).success).toBe(false);
  });
});

describe('IdempotencyKeySchema', () => {
  it('accepts a UUID-like key', () => {
    expect(IdempotencyKeySchema.safeParse('9c8f2b1e-4d3a-4b5c-8e7f-0a1b2c3d4e5f').success).toBe(
      true,
    );
  });

  it('rejects short or exotic keys', () => {
    expect(IdempotencyKeySchema.safeParse('abc').success).toBe(false);
    expect(IdempotencyKeySchema.safeParse('key with spaces!').success).toBe(false);
  });
});
