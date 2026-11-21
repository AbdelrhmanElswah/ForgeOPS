'use client';

import {
  type CreateTaskRequest,
  CreateTaskResponseSchema,
  type TaskStatus,
  TaskPageSchema,
  TaskSchema,
  TaskStatsSchema,
} from '@forgeops/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, toQueryString } from '@/shared';

export const taskKeys = {
  all: ['tasks'] as const,
  list: (status: TaskStatus | null) => [...taskKeys.all, 'list', status] as const,
  stats: () => [...taskKeys.all, 'stats'] as const,
};

const PAGE_SIZE = 20;
/** Tasks change on their own (the worker moves them); poll until 7.4 brings live events. */
const POLL_MS = 5_000;

export function useTasks(status: TaskStatus | null = null, pageSize = PAGE_SIZE) {
  return useInfiniteQuery({
    queryKey: [...taskKeys.list(status), pageSize],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.request(`/tasks${toQueryString({ limit: pageSize, cursor: pageParam, status })}`, {
        schema: TaskPageSchema,
        signal,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    refetchInterval: POLL_MS,
  });
}

export function useTaskStats() {
  return useQuery({
    queryKey: taskKeys.stats(),
    queryFn: ({ signal }) => api.request('/tasks/stats', { schema: TaskStatsSchema, signal }),
    refetchInterval: POLL_MS,
  });
}

/**
 * The caller owns the idempotency key: one key per form, so a retried submit (double click,
 * network blip) never creates a second task.
 */
export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: CreateTaskRequest; idempotencyKey: string }) =>
      api.request('/tasks', {
        method: 'POST',
        body,
        idempotencyKey,
        schema: CreateTaskResponseSchema,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

export function useCancelTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.request(`/tasks/${id}/cancel`, { method: 'POST', schema: TaskSchema }),
    // Also on failure: a 409 means the task moved on (e.g. finished), so show its real state.
    onSettled: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  });
}
