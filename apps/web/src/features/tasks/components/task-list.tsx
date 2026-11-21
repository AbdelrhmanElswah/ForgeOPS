'use client';

import type { Task } from '@forgeops/contracts';
import {
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

import { traceIdOf } from '@/shared';

import { useTasks } from '../api';
import { CancelTaskButton } from './cancel-task-button';
import { TaskBadges } from './task-badges';

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
  return (
    <ResourceRow
      title={
        <Link href={`/tasks/${task.id}`} className="hover:underline">
          {task.instruction}
        </Link>
      }
      badges={<TaskBadges task={task} />}
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
      trailing={<CancelTaskButton task={task} />}
    />
  );
}
