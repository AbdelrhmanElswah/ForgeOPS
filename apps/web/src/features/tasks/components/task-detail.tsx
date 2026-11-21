'use client';

import { isTerminalStatus, type TaskEvent } from '@forgeops/contracts';
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Code,
  EmptyState,
  ErrorState,
  PageHeader,
  ResourceList,
  ResourceRow,
  Skeleton,
  Spinner,
} from '@forgeops/ui';
import { useParams } from 'next/navigation';

import { ApiError, traceIdOf } from '@/shared';

import { useTask, useTaskEvents } from '../api';
import { describeEvent } from '../model';
import { CancelTaskButton } from './cancel-task-button';
import { TaskBadges } from './task-badges';

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const task = useTask(id);
  const live = task.isSuccess && !isTerminalStatus(task.data.status);
  // A finished task's stream replays its timeline and closes; a running one stays live.
  // Keyed on isSuccess, so a stream stopped by a failed refetch restarts once one succeeds.
  const events = useTaskEvents(id, task.isSuccess);

  // A failed background refetch keeps the data: keep showing the task instead of an error page.
  if (task.data === undefined) {
    return <TaskUnavailable task={task} />;
  }

  const { data } = task;
  return (
    <>
      {task.isError && (
        <Alert
          tone="warning"
          title="Showing the last known state: the task could not be refreshed."
          className="mb-4"
        />
      )}
      <PageHeader
        title={data.instruction}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <TaskBadges task={data} />
            on <Code>{data.baseBranch}</Code>
            {data.baseCommitSha && <Code>{data.baseCommitSha.slice(0, 7)}</Code>}
            <span>· ${data.costUsd.toFixed(4)}</span>
          </span>
        }
        actions={<CancelTaskButton task={data} />}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Timeline {live && <Spinner label="Live" />}
          </CardTitle>
          <CardDescription>
            {live ? 'Updates live as the agents work.' : 'What the agents did, step by step.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Timeline events={events} />
        </CardContent>
      </Card>
    </>
  );
}

function TaskUnavailable({ task }: { task: ReturnType<typeof useTask> }) {
  if (task.isPending) {
    return (
      <div aria-busy className="flex flex-col gap-4">
        <Skeleton className="h-8 w-96" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  return task.error instanceof ApiError && task.error.status === 404 ? (
    <EmptyState title="Task not found" description="It may belong to another account." />
  ) : (
    <ErrorState
      title="Could not load the task"
      traceId={traceIdOf(task.error)}
      onRetry={() => void task.refetch()}
    />
  );
}

function Timeline({ events }: { events: readonly TaskEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Waiting for the agents to start…</p>;
  }
  return (
    <ResourceList aria-label="Timeline" aria-live="polite">
      {events.map((event) => {
        const view = describeEvent(event);
        return (
          <ResourceRow
            key={event.seq}
            title={view.title}
            className={view.tone === 'danger' ? 'text-danger' : undefined}
            description={view.detail}
            meta={
              <time dateTime={event.createdAt}>
                {new Date(event.createdAt).toLocaleTimeString()}
              </time>
            }
          />
        );
      })}
    </ResourceList>
  );
}
