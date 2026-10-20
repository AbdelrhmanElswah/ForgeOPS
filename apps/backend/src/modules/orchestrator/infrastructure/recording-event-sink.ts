import type { AgentEvent, AgentEventSink } from '@forgeops/agents';
import type { TaskEventInput } from '@forgeops/contracts';
import { Logger } from '@nestjs/common';

import type { TaskEventsService } from '../../events/application/task-events.service.js';

/**
 * Bridges the agents package's event port to the task timeline: every node, model call and
 * tool call is stored (and streamed to the dashboard). Recording never breaks a run: a failed
 * write is logged and the agents carry on.
 */
export class RecordingEventSink implements AgentEventSink {
  private readonly logger = new Logger(RecordingEventSink.name);

  constructor(
    private readonly taskId: string,
    private readonly events: TaskEventsService,
  ) {}

  async emit(event: AgentEvent): Promise<void> {
    // The agents' event shapes are the contract's input shapes, checked by the compiler here.
    const input: TaskEventInput = event;
    await this.events.record(this.taskId, input).catch((error: unknown) => {
      this.logger.error(
        { err: error, taskId: this.taskId, type: event.type },
        'Could not record event',
      );
    });
  }
}
