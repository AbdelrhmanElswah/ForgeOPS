'use client';

import type { Task } from '@forgeops/contracts';
import {
  Badge,
  Button,
  Code,
  EmptyState,
  ErrorState,
  ResourceList,
  ResourceListSkeleton,
  ResourceRow,
} from '@forgeops/ui';
import { GitBranch, ListChecks } from 'lucide-react';
import Link from 'next/link';

import { ApiError, traceIdOf } from '@/shared';

import { useCancelTask, useTasks } from '../api';
import { canCancel, isWorking, statusLabel, statusTone } from '../model';

export function TaskList() {
  const query = useTasks();
  const tasks = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (query.isPending) return <ResourceListSkeleton />;
  if (query.isError) {
    return (
      <ErrorState
        title="Could not load tasks"
        traceId={traceIdOf(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks aria-hidden />}
        title="No tasks yet"
        description="Describe a bug or a small feature, and the agents will investigate and propose a fix."
        action={
          <Button asChild>
            <Link href="/tasks/new">New task</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ResourceList aria-label="Tasks">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </ResourceList>
      {query.hasNextPage && (
        <Button
          variant="outline"
          className="self-center"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const cancel = useCancelTask();
  return (
    <ResourceRow
      title={task.instruction}
      badges={
        <>
          <Badge tone={statusTone(task.status)} pulse={isWorking(task.status)}>
            {statusLabel(task.status)}
          </Badge>
          {task.failureReason && <Badge tone="danger">{statusLabel(task.failureReason)}</Badge>}
          {task.cancelRequestedAt && task.status !== 'cancelled' && (
            <Badge tone="neutral">Stopping</Badge>
          )}
        </>
      }
      meta={
        <>
          <span className="flex items-center gap-1">
            <GitBranch aria-hidden className="size-3" />
            <Code>{task.baseBranch}</Code>
          </span>
          <time dateTime={task.createdAt}>{new Date(task.createdAt).toLocaleString()}</time>
          {task.costUsd > 0 && <span>${task.costUsd.toFixed(2)}</span>}
        </>
      }
      trailing={
        canCancel(task) && (
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
        )
      }
    />
  );
}
