'use client';

import {
  type CreateTaskRequest,
  CreateTaskResponseSchema,
  isTerminalStatus,
  type Task,
  type TaskEvent,
  TaskEventSchema,
  TaskPageSchema,
  TaskSchema,
  TaskStatsSchema,
  type TaskStatus,
} from '@forgeops/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api, API_URL, toQueryString } from '@/shared';

export const taskKeys = {
  all: ['tasks'] as const,
  list: (status: TaskStatus | null) => [...taskKeys.all, 'list', status] as const,
  stats: () => [...taskKeys.all, 'stats'] as const,
  detail: (id: string) => [...taskKeys.all, 'detail', id] as const,
  events: (id: string) => [...taskKeys.all, 'events', id] as const,
};

const PAGE_SIZE = 20;
/**
 * Lists and stats span many tasks, while live events are per task (see useTaskEvents), so the
 * overview screens poll.
 */
const POLL_MS = 5_000;
/** Wait before reopening a stream the server refused (e.g. after refreshing the session). */
const RECONNECT_MS = 3_000;

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function useTask(id: string) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: ({ signal }) => api.request(`/tasks/${id}`, { schema: TaskSchema, signal }),
  });
}

/**
 * The task's timeline: replayed from the server, then live, kept in the query cache so leaving
 * and reopening the page resumes after the last event instead of replaying everything.
 *
 * - Status events refetch the task, so its header and the lists follow without polling.
 * - The stream is closed once the task reaches a final status; otherwise the browser would
 *   reconnect forever to a stream that has nothing left to say.
 * - A refused connection (HTTP error: EventSource gives up on those) is retried after
 *   refetching the task through the API client, which refreshes an expired session or
 *   surfaces a real error (404) on the page.
 */
export function useTaskEvents(id: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const events = useQuery({
    queryKey: taskKeys.events(id),
    // Filled only by the stream. A "refetch" (e.g. invalidating every ['tasks'] key) returns what
    // is cached, so it can never wipe events that already arrived.
    queryFn: () => queryClient.getQueryData<TaskEvent[]>(taskKeys.events(id)) ?? [],
    initialData: [] as TaskEvent[],
    staleTime: Infinity,
    gcTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!enabled) return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const refreshTask = () => queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });

    const stop = () => {
      stopped = true;
      clearTimeout(retry);
      source?.close();
      source = null;
    };

    const open = () => {
      const cached = queryClient.getQueryData<TaskEvent[]>(taskKeys.events(id)) ?? [];
      const after = cached.at(-1)?.seq ?? 0;
      source = new EventSource(`${API_URL}/api/v1/tasks/${id}/events?after=${String(after)}`, {
        withCredentials: true,
      });

      source.onmessage = (message: MessageEvent<string>) => {
        const parsed = TaskEventSchema.safeParse(parseJson(message.data));
        if (!parsed.success) return; // an unknown event type must not break the timeline
        const event = parsed.data;
        queryClient.setQueryData<TaskEvent[]>(taskKeys.events(id), (current = []) =>
          event.seq > (current.at(-1)?.seq ?? 0) ? [...current, event] : current,
        );
        if (event.type === 'status.changed') {
          void queryClient.invalidateQueries({ queryKey: taskKeys.all, refetchType: 'active' });
          if (isTerminalStatus(event.status)) stop();
        }
      };

      source.onerror = () => {
        // The server also closes the stream when a finished task has nothing left to send, and
        // the browser would reconnect forever: so every error asks "is the task finished?".
        const refused = source?.readyState === EventSource.CLOSED;
        void refreshTask().then(() => {
          if (stopped) return;
          const task = queryClient.getQueryData<Task>(taskKeys.detail(id));
          const failed = queryClient.getQueryState(taskKeys.detail(id))?.status === 'error';
          if (failed || (task && isTerminalStatus(task.status))) {
            stop();
          } else if (refused) {
            // HTTP error: EventSource gave up, so reopen ourselves (the session is fresh now).
            retry = setTimeout(open, RECONNECT_MS);
          } // else: a dropped connection the browser is already retrying with Last-Event-ID
        });
      };
    };

    open();
    return stop;
  }, [id, enabled, queryClient]);

  return events.data;
}

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
