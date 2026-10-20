import { TASK_STATUSES, TERMINAL_TASK_STATUSES } from '@forgeops/contracts';
import { describe, expect, it } from 'vitest';

import {
  assertTransition,
  canTransition,
  InvalidStateTransitionError,
  TASK_TRANSITIONS,
} from './task-status.js';

describe('task state machine', () => {
  it.each([
    ['queued', 'planning'],
    ['planning', 'investigating'],
    ['investigating', 'implementing'],
    ['implementing', 'verifying'],
    ['verifying', 'implementing'], // retry after failed tests
    ['verifying', 'investigating'], // root cause unclear
    ['verifying', 'awaiting_approval'],
    ['awaiting_approval', 'publishing'],
    ['awaiting_approval', 'rejected'],
    ['publishing', 'completed'],
  ] as const)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ['queued', 'completed', 'skipping the whole workflow'],
    ['implementing', 'awaiting_approval', 'skipping verification'],
    ['verifying', 'publishing', 'publishing without approval'],
    ['awaiting_approval', 'completed', 'completing without publishing'],
    ['publishing', 'cancelled', 'cancelling halfway through a publish'],
  ] as const)('forbids %s → %s (%s)', (from, to, _reason) => {
    expect(() => {
      assertTransition(from, to);
    }).toThrow(InvalidStateTransitionError);
  });

  it('lets no terminal status move anywhere', () => {
    for (const terminal of TERMINAL_TASK_STATUSES) {
      expect(TASK_TRANSITIONS[terminal]).toEqual([]);
    }
  });

  it('lets every non-terminal status, except publishing, be cancelled', () => {
    const cancellable = TASK_STATUSES.filter((status) => canTransition(status, 'cancelled'));

    expect(cancellable).toEqual([
      'queued',
      'planning',
      'investigating',
      'implementing',
      'verifying',
      'awaiting_approval',
    ]);
  });

  it('only reaches publishing through awaiting_approval', () => {
    const into = TASK_STATUSES.filter((status) => canTransition(status, 'publishing'));

    expect(into).toEqual(['awaiting_approval']);
  });
});
