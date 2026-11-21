'use client';

import type { Task } from '@forgeops/contracts';
import { Button } from '@forgeops/ui';

import { ApiError } from '@/shared';

import { useCancelTask } from '../api';
import { canCancel } from '../model';

/** Renders nothing once the task can no longer be stopped. */
export function CancelTaskButton({ task }: { task: Task }) {
  const cancel = useCancelTask();
  if (!canCancel(task)) return null;
  return (
    <>
      {cancel.isError && (
        <span role="alert" className="text-xs text-danger">
          {cancel.error instanceof ApiError ? cancel.error.message : 'Could not cancel'}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        loading={cancel.isPending}
        aria-label={`Cancel task: ${task.instruction}`}
        onClick={() => {
          cancel.mutate(task.id);
        }}
      >
        Cancel
      </Button>
    </>
  );
}
