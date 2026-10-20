import { describe, expect, it } from 'vitest';

import { HOME_PATH, safeNextPath } from './config';

describe('safeNextPath (post-login redirect)', () => {
  it.each(['/tasks', '/tasks/123?tab=diff', '/settings/integrations'])(
    'keeps the in-app path %s',
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    },
  );

  it.each([
    ['an absolute URL', 'https://evil.example/phish'],
    ['a protocol-relative URL', '//evil.example'],
    ['a backslash trick', '/\\evil.example'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['nothing', null],
  ])('falls back to the dashboard for %s (open-redirect protection)', (_case, value) => {
    expect(safeNextPath(value)).toBe(HOME_PATH);
  });
});
