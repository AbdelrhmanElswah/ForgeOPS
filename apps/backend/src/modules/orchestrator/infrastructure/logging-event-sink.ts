import type { AgentEvent, AgentEventSink } from '@forgeops/agents';
import { Logger } from '@nestjs/common';

/** Writes agent events to the structured log. Step 4.8 persists them and streams them over SSE. */
export class LoggingEventSink implements AgentEventSink {
  private readonly logger = new Logger('AgentEvents');

  constructor(private readonly taskId: string) {}

  emit(event: AgentEvent): Promise<void> {
    this.logger.debug({ taskId: this.taskId, ...event }, event.type);
    return Promise.resolve();
  }
}
