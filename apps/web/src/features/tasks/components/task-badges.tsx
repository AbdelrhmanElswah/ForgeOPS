import type { Task } from '@forgeops/contracts';
import { Badge } from '@forgeops/ui';

import { isWorking, statusLabel, statusTone } from '../model';

/** Status, failure reason and pending cancel: the same badges in the list and on the detail page. */
export function TaskBadges({ task }: { task: Task }) {
  return (
    <>
      <Badge tone={statusTone(task.status)} pulse={isWorking(task.status)}>
        {statusLabel(task.status)}
      </Badge>
      {task.failureReason && <Badge tone="danger">{statusLabel(task.failureReason)}</Badge>}
      {task.cancelRequestedAt && task.status !== 'cancelled' && (
        <Badge tone="neutral">Stopping</Badge>
      )}
    </>
  );
}
