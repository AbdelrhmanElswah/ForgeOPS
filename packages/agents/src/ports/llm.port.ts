import type { z } from 'zod';

import type { AgentRole } from '../roles.js';

/**
 * Port: everything the agent graph needs from a language model, in our own vocabulary.
 * Nodes depend on this interface only; the Claude adapter (llm/anthropic) implements it,
 * and FakeLlmClient (testing) scripts it for deterministic tests.
 */
export interface LlmClient {
  /** One request whose answer must match `schema` (planner, reviewer). */
  generateStructured<S extends z.ZodType>(
    request: StructuredRequest<S>,
  ): Promise<{ output: z.output<S>; usage: LlmUsage }>;

  /** One model turn that may call tools (investigator, implementer). The node drives the loop. */
  respond(request: TurnRequest): Promise<LlmTurn>;
}

export interface StructuredRequest<S extends z.ZodType> {
  role: AgentRole;
  system: string;
  messages: LlmMessage[];
  schema: S;
  signal?: AbortSignal;
}

export interface TurnRequest {
  role: AgentRole;
  system: string;
  messages: LlmMessage[];
  tools: LlmToolDefinition[];
  signal?: AbortSignal;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  /** Must be a strict object: unknown keys are rejected, so the model can't smuggle arguments. */
  input: z.ZodObject;
}

export interface LlmToolCall {
  id: string;
  name: string;
  /** Unvalidated: the tool pipeline parses it with the tool's schema before running anything. */
  input: unknown;
}

export type LlmUserContent =
  | { type: 'text'; text: string }
  | { type: 'tool_result'; toolCallId: string; content: string; isError?: boolean };

/**
 * Conversation history. Assistant turns keep the provider's raw content and are replayed
 * verbatim: models such as Claude return thinking blocks that must be passed back unchanged,
 * and a lossy round-trip through a neutral format would break multi-turn tool loops.
 */
export type LlmMessage =
  { role: 'user'; content: LlmUserContent[] } | { role: 'assistant'; providerContent: unknown };

export interface LlmTurn {
  stopReason: 'end_turn' | 'tool_use' | 'pause_turn';
  text: string;
  toolCalls: LlmToolCall[];
  /** Append this to `messages` before sending tool results. */
  assistantMessage: LlmMessage;
  usage: LlmUsage;
}

export interface LlmUsage {
  /** The model that actually served the request (may differ from the requested one after a fallback). */
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  /** Null when the model has no known price: never silently counted as free. */
  costUsd: number | null;
}

/** Base class for model failures the graph routes on (fail the task, ask a human, retry). */
export abstract class LlmError extends Error {
  constructor(
    message: string,
    readonly usage: LlmUsage | null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The model (and any fallback model) declined the request for policy reasons. */
export class LlmRefusalError extends LlmError {
  constructor(
    readonly category: string | null,
    usage: LlmUsage,
  ) {
    super(`The model declined the request${category ? ` (${category})` : ''}.`, usage);
  }
}

/** Output was cut off by the token limit: a partial answer is never used. */
export class LlmTruncatedError extends LlmError {
  constructor(usage: LlmUsage) {
    super('The model output hit the token limit before finishing.', usage);
  }
}

/**
 * The provider failed to answer (network, rate limit, overload, bad credentials).
 * `retryable` separates "try again later" (timeouts, 429, 5xx) from "retrying won't help"
 * (401, 400): the worker retries the first kind and fails the task on the second.
 */
export class LlmProviderError extends LlmError {
  constructor(
    readonly status: number | null,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(
      `The model provider failed${status ? ` (HTTP ${String(status)})` : ''}${retryable ? '; retryable' : ''}.`,
      null,
      options,
    );
  }
}

/** Output did not match the required schema. */
export class LlmInvalidOutputError extends LlmError {
  constructor(usage: LlmUsage | null, options?: ErrorOptions) {
    super('The model output did not match the required schema.', usage, options);
  }
}
