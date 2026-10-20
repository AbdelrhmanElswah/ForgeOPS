import {
  IdSchema,
  isTerminalStatus,
  TASK_EVENT_HEARTBEAT,
  type TaskEvent,
} from '@forgeops/contracts';
import { Controller, Headers, type MessageEvent, Query, Sse } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { finalize, interval, map, merge, type Observable, Subject, takeUntil } from 'rxjs';
import { z } from 'zod';

import { ApiProblemResponses } from '../../../common/openapi/zod-openapi.js';
import { ZodParam } from '../../../common/validation/zod-validation.pipe.js';
import { type AuthenticatedUser, CurrentUser } from '../../auth/http/auth.decorators.js';
import { TaskEventsService } from '../../events/application/task-events.service.js';
import { TaskQueries } from '../application/task.queries.js';

/** Proxies and load balancers close idle connections; a heartbeat keeps the stream open. */
export const HEARTBEAT_MS = 15_000;
/** Tells EventSource how long to wait before reconnecting after a drop. */
const RECONNECT_MS = 3_000;

const SeqSchema = z.coerce.number().int().min(0).catch(0);

@ApiTags('tasks')
@Controller('tasks')
export class TaskEventsController {
  constructor(
    private readonly queries: TaskQueries,
    private readonly events: TaskEventsService,
  ) {}

  /**
   * Server-Sent Events: the task's timeline, then live updates.
   * Browsers reconnect automatically and send `Last-Event-ID`; the stream resumes right after
   * the last event the client received. `?after=` does the same for the first connection.
   */
  @Sse(':id/events')
  @ApiOperation({ summary: 'Live task timeline (Server-Sent Events, resumable)' })
  @ApiQuery({ name: 'after', required: false, description: 'Replay events after this seq' })
  @ApiProblemResponses(401, 404)
  async stream(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParam('id', IdSchema) taskId: string,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Query('after') after: string | undefined,
  ): Promise<Observable<MessageEvent>> {
    // Ownership is checked before the stream opens, so a stranger gets a real 404.
    await this.queries.get(user.id, taskId);
    const afterSeq = SeqSchema.parse(lastEventId ?? after);

    const done = new Subject<void>();
    const events = this.events
      .stream(taskId, afterSeq, async () =>
        isTerminalStatus((await this.queries.get(user.id, taskId)).status),
      )
      .pipe(
        map((event: TaskEvent): MessageEvent => ({
          id: String(event.seq),
          data: event,
          retry: RECONNECT_MS,
        })),
        finalize(() => {
          done.next();
        }),
      );
    const heartbeats = interval(HEARTBEAT_MS).pipe(
      takeUntil(done),
      map((): MessageEvent => ({ type: TASK_EVENT_HEARTBEAT, data: '' })),
    );
    return merge(events, heartbeats);
  }
}
