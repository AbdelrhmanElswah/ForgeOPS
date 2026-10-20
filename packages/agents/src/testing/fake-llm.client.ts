import type { z } from 'zod';

import {
  type LlmClient,
  type LlmMessage,
  type LlmTurn,
  type LlmUsage,
  type StructuredRequest,
  type TurnRequest,
} from '../ports/llm.port.js';
import type { AgentRole } from '../roles.js';

export const FAKE_USAGE: LlmUsage = {
  model: 'fake-model',
  inputTokens: 100,
  outputTokens: 50,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  costUsd: 0.001,
};

type Scripted<T> = T | Error | ((request: unknown) => T);

/**
 * Deterministic stand-in for a model. Tests script answers per role, in order; every
 * request is recorded for assertions. An unscripted call fails loudly instead of returning
 * something plausible, so a test can never pass by accident.
 */
export class FakeLlmClient implements LlmClient {
  readonly structuredRequests: StructuredRequest<z.ZodType>[] = [];
  readonly turnRequests: TurnRequest[] = [];
  private readonly structured = new Map<AgentRole, Scripted<unknown>[]>();
  private readonly turns = new Map<AgentRole, Scripted<Omit<LlmTurn, 'usage'>>[]>();

  /** Queue the next structured answer (or error) for `role`. */
  answer(role: AgentRole, output: Scripted<unknown>): this {
    this.structured.set(role, [...(this.structured.get(role) ?? []), output]);
    return this;
  }

  /** Queue the next tool-loop turn (or error) for `role`. */
  turn(role: AgentRole, turn: Scripted<Omit<LlmTurn, 'usage'>>): this {
    this.turns.set(role, [...(this.turns.get(role) ?? []), turn]);
    return this;
  }

  generateStructured<S extends z.ZodType>(
    request: StructuredRequest<S>,
  ): Promise<{ output: z.output<S>; usage: LlmUsage }> {
    this.structuredRequests.push({ ...request, messages: snapshot(request.messages) });
    const next = this.dequeue(this.structured, request.role, 'answer');
    return Promise.resolve().then(() => {
      const value = resolve(next, request);
      // Validate like the real adapter would, so tests catch fixtures that drifted from the schema.
      return { output: request.schema.parse(value), usage: FAKE_USAGE };
    });
  }

  respond(request: TurnRequest): Promise<LlmTurn> {
    // Record what was sent *at this moment*: callers keep appending to the same array, and a
    // real client serialises the request when it is made.
    this.turnRequests.push({ ...request, messages: snapshot(request.messages) });
    const next = this.dequeue(this.turns, request.role, 'turn');
    return Promise.resolve().then(() => ({ ...resolve(next, request), usage: FAKE_USAGE }));
  }

  /** True when every scripted answer was consumed. */
  get exhausted(): boolean {
    return [...this.structured.values(), ...this.turns.values()].every((q) => q.length === 0);
  }

  private dequeue<T>(queues: Map<AgentRole, T[]>, role: AgentRole, kind: string): T {
    const next = queues.get(role)?.shift();
    if (next === undefined) {
      throw new Error(`FakeLlmClient: no scripted ${kind} left for role "${role}"`);
    }
    return next;
  }
}

function resolve<T>(scripted: Scripted<T>, request: unknown): T {
  if (scripted instanceof Error) throw scripted;
  return typeof scripted === 'function' ? (scripted as (r: unknown) => T)(request) : scripted;
}

function snapshot(messages: LlmMessage[]): LlmMessage[] {
  return structuredClone(messages);
}
