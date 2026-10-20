import { TASK_STATUSES, type TaskStatus } from '@forgeops/contracts';

import { DomainError } from '../../../common/errors/domain-error.js';

/**
 * The task lifecycle as data (docs/ARCHITECTURE.md §9). A status change not listed here is
 * impossible, not merely unlikely: every write goes through `assertTransition`.
 */
export const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  queued: ['planning', 'cancelled', 'failed'],
  planning: ['investigating', 'cancelled', 'failed'],
  investigating: ['implementing', 'cancelled', 'failed'],
  implementing: ['verifying', 'cancelled', 'failed'],
  // Failed tests loop back for another attempt; an unclear cause goes back to investigation.
  verifying: ['implementing', 'investigating', 'awaiting_approval', 'cancelled', 'failed'],
  awaiting_approval: ['publishing', 'rejected', 'cancelled'],
  // Publishing is never cancelled halfway: it either completes or fails cleanly.
  publishing: ['completed', 'failed'],
  completed: [],
  rejected: [],
  failed: [],
  cancelled: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

export class InvalidStateTransitionError extends DomainError {
  readonly code = 'invalid_state_transition';

  constructor(
    readonly from: TaskStatus,
    readonly to: TaskStatus,
  ) {
    super(`A task cannot move from "${from}" to "${to}".`);
  }
}

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}

/** Checked at module load: every status has an entry, so a new status can't be forgotten. */
for (const status of TASK_STATUSES) {
  if (!(status in TASK_TRANSITIONS)) {
    throw new Error(`TASK_TRANSITIONS is missing "${status}"`);
  }
}
