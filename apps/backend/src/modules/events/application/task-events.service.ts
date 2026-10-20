import { isTerminalStatus, type TaskEvent, type TaskEventInput } from '@forgeops/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';

import { TaskEventBus, TaskEventStore } from './event-ports.js';

/** Safety net: even if every pub/sub message were lost, a client lags by at most this. */
export const EVENT_CATCH_UP_INTERVAL_MS = 5_000;
const REPLAY_BATCH = 500;

const isFinalEvent = (event: TaskEvent) =>
  event.type === 'status.changed' && isTerminalStatus(event.status);

@Injectable()
export class TaskEventsService {
  private readonly logger = new Logger(TaskEventsService.name);

  constructor(
    private readonly store: TaskEventStore,
    private readonly bus: TaskEventBus,
  ) {}

  /** Store first (truth), then publish (speed). A failed publish is only a delay, never a loss. */
  async record(taskId: string, input: TaskEventInput): Promise<TaskEvent> {
    const event = await this.store.append(taskId, input);
    await this.bus.publish(event).catch((error: unknown) => {
      this.logger.warn(
        { err: error, taskId, seq: event.seq },
        'Event publish failed; clients will catch up',
      );
    });
    return event;
  }

  /**
   * Events after `afterSeq`, then live events, in strict `seq` order without duplicates or gaps.
   *
   *  1. Subscribe to live events first, so nothing published during the replay is missed.
   *  2. Replay from the store. Live events arriving out of order (a gap in seq) trigger a
   *     catch-up from the store instead of being delivered out of order.
   *  3. Poll the store periodically as a safety net for lost pub/sub messages.
   *  4. Complete after the task's final status event, or immediately if `isFinished()` says the
   *     task ended and there is nothing left to replay.
   */
  stream(
    taskId: string,
    afterSeq: number,
    isFinished: () => Promise<boolean>,
  ): Observable<TaskEvent> {
    return new Observable<TaskEvent>((subscriber) => {
      let lastSeq = afterSeq;
      let closed = false;
      // Read through a function: other callbacks flip `closed` while we await, which a plain
      // read after an await would hide from the type checker's narrowing.
      const isClosed = () => closed;
      let unsubscribe: (() => Promise<void>) | undefined;
      let catchingUp: Promise<void> = Promise.resolve();

      const finish = () => {
        if (closed) return;
        closed = true;
        subscriber.complete();
      };

      const deliver = (event: TaskEvent): boolean => {
        if (closed || event.seq <= lastSeq) return true; // duplicate: already delivered
        if (event.seq !== lastSeq + 1) return false; // gap: fetch the missing ones first
        lastSeq = event.seq;
        subscriber.next(event);
        if (isFinalEvent(event)) finish();
        return true;
      };

      // Serialised, so two catch-ups never interleave their deliveries.
      const catchUp = () => {
        catchingUp = catchingUp.then(async () => {
          while (!closed) {
            const batch = await this.store.listAfter(taskId, lastSeq, REPLAY_BATCH);
            batch.forEach(deliver);
            if (batch.length < REPLAY_BATCH) return;
          }
        });
        return catchingUp;
      };

      const fail = (error: unknown) => {
        if (closed) return;
        closed = true;
        subscriber.error(error);
      };

      // The poll also ends the stream if the task finished but its final event is missing
      // (its write failed): a live stream must never stay open forever.
      const poll = setInterval(() => {
        void catchUp()
          .then(async () => {
            if (!closed && (await isFinished())) finish();
          })
          .catch(fail);
      }, EVENT_CATCH_UP_INTERVAL_MS);

      void (async () => {
        unsubscribe = await this.bus
          .subscribe(taskId, (event) => {
            if (!deliver(event)) void catchUp().catch(fail);
          })
          .catch((error: unknown) => {
            // Live delivery is optional: the poll keeps the stream working without Redis.
            this.logger.warn({ err: error, taskId }, 'Live events unavailable; polling only');
            return undefined;
          });
        await catchUp();
        if (!isClosed() && (await isFinished())) {
          await catchUp(); // the final event may have been written a moment ago
          finish();
        }
      })().catch(fail);

      return () => {
        closed = true;
        clearInterval(poll);
        void unsubscribe?.();
      };
    });
  }
}
