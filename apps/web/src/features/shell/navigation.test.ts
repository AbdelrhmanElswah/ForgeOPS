import { describe, expect, it } from 'vitest';

import { isActive } from './navigation';

describe('isActive', () => {
  it('highlights a section on its own page and its sub-pages', () => {
    expect(isActive('/tasks', '/tasks')).toBe(true);
    expect(isActive('/tasks/123/review', '/tasks')).toBe(true);
  });

  it('does not match a different section that merely shares a prefix', () => {
    expect(isActive('/tasks-archive', '/tasks')).toBe(false);
    expect(isActive('/dashboard', '/tasks')).toBe(false);
  });
});
