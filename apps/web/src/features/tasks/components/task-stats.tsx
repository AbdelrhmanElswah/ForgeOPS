'use client';

import { Badge, Card, CardContent, ErrorState, Skeleton } from '@forgeops/ui';

import { traceIdOf } from '@/shared';

import { useTaskStats } from '../api';
import { STAT_GROUPS, sumStatuses } from '../model';

export function TaskStats() {
  const stats = useTaskStats();

  if (stats.isPending) {
    return (
      <div aria-busy className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_GROUPS.map((group) => (
          <Skeleton key={group.label} className="h-24" />
        ))}
      </div>
    );
  }
  if (stats.isError) {
    return (
      <ErrorState
        title="Could not load task statistics"
        traceId={traceIdOf(stats.error)}
        onRetry={() => void stats.refetch()}
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STAT_GROUPS.map((group) => (
        <Card key={group.label} aria-label={group.label}>
          <CardContent className="flex flex-col items-start gap-2 pt-5">
            <Badge tone={group.tone}>{group.label}</Badge>
            <p className="text-3xl font-semibold tabular-nums">
              {sumStatuses(stats.data.byStatus, group.statuses)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
