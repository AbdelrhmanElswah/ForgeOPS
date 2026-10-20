import { describe, expect, it } from 'vitest';

import { PathGuard } from './path-guard.js';

describe('PathGuard', () => {
  const guard = new PathGuard(['src/legacy/**']);

  it.each([
    ['src/checkout/controller.ts', 'src/checkout/controller.ts'],
    ['./src/a.ts', 'src/a.ts'],
    ['src/../src/a.ts', 'src/a.ts'],
    ['src/', 'src'],
    ['.', ''],
    ['README.md', 'README.md'],
    ['.github/ISSUE_TEMPLATE.md', '.github/ISSUE_TEMPLATE.md'],
  ])('allows reading %s (normalised to "%s")', (raw, normalised) => {
    expect(guard.check(raw, 'read')).toEqual({ ok: true, path: normalised });
  });

  describe('workspace escapes', () => {
    it.each([
      ['parent directory', '../outside.ts'],
      ['nested escape', 'src/../../etc/passwd'],
      ['absolute path', '/etc/passwd'],
      ['windows drive', 'C:/Windows/system.ini'],
      ['backslashes', 'src\\..\\..\\secret'],
      ['null byte', 'src/a.ts\0.png'],
      ['newline', 'src/a.ts\nother'],
      ['empty', ''],
      ['too long', 'a/'.repeat(300)],
    ])('rejects %s', (_case, raw) => {
      expect(guard.check(raw, 'read').ok).toBe(false);
    });
  });

  describe('secrets and git internals (read and write)', () => {
    it.each([
      '.env',
      '.env.production',
      'apps/api/.env',
      'APPS/API/.ENV', // case-insensitive
      '.git/config',
      'deploy/server.pem',
      'keys/id_rsa',
      '.npmrc',
      'config/secrets/db.json',
    ])('denies reading %s', (path) => {
      expect(guard.check(path, 'read').ok).toBe(false);
    });

    it('denies the traversal-then-secret trick', () => {
      expect(guard.check('src/../.env', 'read').ok).toBe(false);
    });
  });

  describe('write-only denials', () => {
    it.each([
      '.github/workflows/ci.yml',
      'package-lock.json',
      'pnpm-lock.yaml',
      'node_modules/x/i.js',
    ])('may read but not write %s', (path) => {
      expect(guard.check(path, 'read').ok).toBe(true);
      expect(guard.check(path, 'write').ok).toBe(false);
    });
  });

  it('applies the repository’s extra denied paths', () => {
    expect(guard.check('src/legacy/billing.ts', 'read').ok).toBe(false);
    expect(new PathGuard().check('src/legacy/billing.ts', 'read').ok).toBe(true);
  });
});
