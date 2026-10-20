import { TASK_FAILURE_REASONS, TASK_STATUSES } from '@forgeops/contracts';
import { describe, expect, it } from 'vitest';

import { TaskFailureReason, TaskStatus } from '../../generated/prisma/enums.js';

/**
 * The same enums exist twice: in the database schema (Prisma) and in the API contract (Zod).
 * Any drift between them would let the API return a value the frontend can't parse, or
 * store a value the frontend can't send. This test turns that drift into a red build.
 */
describe('Prisma enums match @forgeops/contracts', () => {
  it('TaskStatus', () => {
    expect(Object.values(TaskStatus)).toEqual([...TASK_STATUSES]);
  });

  it('TaskFailureReason', () => {
    expect(Object.values(TaskFailureReason)).toEqual([...TASK_FAILURE_REASONS]);
  });
});
