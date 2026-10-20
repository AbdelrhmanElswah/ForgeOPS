import type { TaskEvent, TaskEventInput } from '@forgeops/contracts';
import { firstValueFrom, type Observable, toArray } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type InMemoryTaskEventBus,
  type InMemoryTaskEventStore,
  inMemoryTaskEvents,
} from '../../../../test/fakes/in-memory-task-events.js';
import { EVENT_CATCH_UP_INTERVAL_MS, type TaskEventsService } from './task-events.service.js';

const TASK = '0192f0c4-7a3e-7c1d-9b2a-5e6f7a8b9c0d';
const node = (name: string): TaskEventInput => ({ type: 'node.started', node: name });
const finished: TaskEventInput = {
  type: 'status.changed',
  status: 'failed',
  failureReason: 'needs_human',
};

/** Subscribes and collects every event the stream emits, plus whether it completed. */
function collect(stream: Observable<TaskEvent>) {
  const seen: number[] = [];
  let completed = false;
  const subscription = stream.subscribe({
    next: (event) => seen.push(event.seq),
    complete: () => {
      completed = true;
    },
  });
  return { seen, isCompleted: () => completed, subscription };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('TaskEventsService', () => {
  let service: TaskEventsService;
  let store: InMemoryTaskEventStore;
  let bus: InMemoryTaskEventBus;
  let taskFinished: boolean;
  const isFinished = () => Promise.resolve(taskFinished);

  beforeEach(() => {
    ({ service, store, bus } = inMemoryTaskEvents());
    taskFinished = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('assigns a gap-free sequence per task', async () => {
    const a = await service.record(TASK, node('planner'));
    const b = await service.record(TASK, node('investigator'));

    expect([a.seq, b.seq]).toEqual([1, 2]);
  });

  it('replays only what the client has not seen yet (Last-Event-ID)', async () => {
    for (const name of ['a', 'b', 'c']) await service.record(TASK, node(name));
    await service.record(TASK, finished);

    const events = await firstValueFrom(service.stream(TASK, 2, isFinished).pipe(toArray()));

    expect(events.map((e) => e.seq)).toEqual([3, 4]);
  });

  it('streams live events after the replay and completes on the final status', async () => {
    await service.record(TASK, node('planner'));
    const stream = collect(service.stream(TASK, 0, isFinished));
    await flush();

    await service.record(TASK, node('investigator'));
    await service.record(TASK, finished);
    await flush();

    expect(stream.seen).toEqual([1, 2, 3]);
    expect(stream.isCompleted()).toBe(true);
  });

  it('never delivers duplicates (live message for something already replayed)', async () => {
    await service.record(TASK, node('planner'));
    const stream = collect(service.stream(TASK, 0, isFinished));
    await flush();

    const [first] = await store.listAfter(TASK, 0, 1);
    if (first) await bus.publish(first); // a late duplicate

    expect(stream.seen).toEqual([1]);
    stream.subscription.unsubscribe();
  });

  it('fills a gap from the store instead of delivering out of order', async () => {
    const stream = collect(service.stream(TASK, 0, isFinished));
    await flush();

    bus.dropMessages = true;
    await service.record(TASK, node('planner')); // seq 1: lost in transit
    bus.dropMessages = false;
    await service.record(TASK, node('investigator')); // seq 2 arrives first
    await flush();

    expect(stream.seen).toEqual([1, 2]);
    stream.subscription.unsubscribe();
  });

  it('recovers from lost messages through the periodic catch-up', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const stream = collect(service.stream(TASK, 0, isFinished));
    await flush();

    bus.dropMessages = true; // Redis delivers nothing at all
    await service.record(TASK, node('planner'));
    await service.record(TASK, finished);
    expect(stream.seen).toEqual([]);

    await vi.advanceTimersByTimeAsync(EVENT_CATCH_UP_INTERVAL_MS);

    expect(stream.seen).toEqual([1, 2]);
    expect(stream.isCompleted()).toBe(true);
  });

  it('completes at once for a finished task whose events were all seen', async () => {
    await service.record(TASK, finished);
    taskFinished = true;

    const events = await firstValueFrom(service.stream(TASK, 1, isFinished).pipe(toArray()));

    expect(events).toEqual([]);
  });

  it('closes even if the final status event was never written', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const stream = collect(service.stream(TASK, 0, isFinished));
    await flush();

    taskFinished = true; // status committed, but its event write failed
    await vi.advanceTimersByTimeAsync(EVENT_CATCH_UP_INTERVAL_MS);

    expect(stream.isCompleted()).toBe(true);
  });

  it('releases the live subscription when the client disconnects', async () => {
    const stream = collect(service.stream(TASK, 0, isFinished));
    await flush();
    expect(bus.subscriberCount(TASK)).toBe(1);

    stream.subscription.unsubscribe();
    await flush();

    expect(bus.subscriberCount(TASK)).toBe(0);
  });
});
