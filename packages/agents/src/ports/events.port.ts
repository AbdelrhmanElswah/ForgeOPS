import type { AgentRole } from '../roles.js';

/**
 * What the graph reports while it runs. The backend persists these (agent_events) and streams
 * them to the dashboard over SSE (step 4.8). Payloads stay small and never contain secrets
 * or file contents.
 */
export type AgentEvent =
  | { type: 'node.started'; node: string }
  | { type: 'node.completed'; node: string; durationMs: number }
  | {
      type: 'llm.called';
      role: AgentRole;
      model: string;
      inputTokens: number;
      outputTokens: number;
      costUsd: number | null;
    }
  | {
      type: 'tool.called';
      role: AgentRole;
      tool: string;
      ok: boolean;
      durationMs: number;
      /** Short reason when `ok` is false: shown in the timeline. */
      error?: string;
    };

/** Port: where events go. */
export interface AgentEventSink {
  emit(event: AgentEvent): Promise<void>;
}

/** Collects events in memory: used by tests and by runs that don't need streaming. */
export class MemoryEventSink implements AgentEventSink {
  readonly events: AgentEvent[] = [];

  emit(event: AgentEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}
