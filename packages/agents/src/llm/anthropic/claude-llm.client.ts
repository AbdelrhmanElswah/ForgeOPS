import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

import {
  type LlmClient,
  LlmInvalidOutputError,
  type LlmMessage,
  LlmRefusalError,
  type LlmToolCall,
  type LlmToolDefinition,
  LlmTruncatedError,
  type LlmTurn,
  type LlmUsage,
  type StructuredRequest,
  type TurnRequest,
} from '../../ports/llm.port.js';
import type { AgentRole } from '../../roles.js';
import { estimateCostUsd } from './pricing.js';

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type BetaContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface RoleModel {
  model: string;
  effort: Effort;
}

export interface ClaudeLlmClientOptions {
  /** Inject a configured client (tests pass one with a fake `fetch`). Defaults to `new Anthropic()`. */
  client?: Anthropic;
  /** Model and effort per agent role. */
  models: Record<AgentRole, RoleModel>;
  /** Non-streaming requests stay well under SDK HTTP timeouts at this size. */
  maxTokens?: number;
  /**
   * On a policy decline, let the API re-run the request on a server-chosen fallback model
   * within the same call. On by default; disable to make declines final.
   */
  serverSideFallback?: boolean;
}

const DEFAULT_MAX_TOKENS = 16_000;
const SERVER_SIDE_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Defaults: every role on the current default model; effort set explicitly (Opus 5.5 defaults to medium). */
export const DEFAULT_ROLE_MODELS: Record<AgentRole, RoleModel> = {
  planner: { model: 'claude-opus-5-5', effort: 'high' },
  investigator: { model: 'claude-opus-5-5', effort: 'high' },
  implementer: { model: 'claude-opus-5-5', effort: 'high' },
  reviewer: { model: 'claude-opus-5-5', effort: 'high' },
};

/**
 * Adapter: implements the LlmClient port with the official Anthropic SDK.
 *
 * - Structured outputs (`output_config.format`) constrain the answer to the Zod schema, and the
 *   SDK validates it again on the way back.
 * - Thinking is left at the model's adaptive default; depth is tuned per role with `effort`.
 * - Tools are declared `strict: true` so tool inputs always match their schema. Forced tool
 *   choice is not used (current models reject it); prompts steer tool use instead.
 * - Refusals and truncation become typed errors, so the graph can route on them.
 */
export class ClaudeLlmClient implements LlmClient {
  private readonly client: Anthropic;
  private readonly maxTokens: number;

  constructor(private readonly options: ClaudeLlmClientOptions) {
    this.client = options.client ?? new Anthropic();
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async generateStructured<S extends z.ZodType>(
    request: StructuredRequest<S>,
  ): Promise<{ output: z.output<S>; usage: LlmUsage }> {
    const { model, effort } = this.options.models[request.role];
    // The SDK helper converts the Zod schema into the JSON schema structured outputs accept.
    // We send it with `create()` rather than `parse()` so that `stop_reason` is checked *before*
    // parsing: a truncated answer must surface as truncation (not as "invalid JSON"), and the
    // usage of a failed call must still reach the cost ledger.
    const { type, schema } = betaZodOutputFormat(request.schema);
    const response = await this.client.beta.messages.create(
      {
        model,
        max_tokens: this.maxTokens,
        system: request.system,
        messages: toAnthropicMessages(request.messages),
        output_config: { effort, format: { type, schema } },
        ...this.fallbackParams(),
      },
      { signal: request.signal },
    );

    const usage = toUsage(response);
    assertCompleted(response, usage);

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new LlmInvalidOutputError(usage, { cause: error });
    }
    // The source of truth is our Zod contract: validate even though the API constrained the shape.
    const parsed = request.schema.safeParse(json);
    if (!parsed.success) {
      throw new LlmInvalidOutputError(usage, { cause: parsed.error });
    }
    return { output: parsed.data, usage };
  }

  async respond(request: TurnRequest): Promise<LlmTurn> {
    const { model, effort } = this.options.models[request.role];
    const response = await this.client.beta.messages.create(
      {
        model,
        max_tokens: this.maxTokens,
        system: request.system,
        messages: toAnthropicMessages(request.messages),
        tools: request.tools.map(toAnthropicTool),
        output_config: { effort },
        ...this.fallbackParams(),
      },
      { signal: request.signal },
    );

    const usage = toUsage(response);
    assertCompleted(response, usage);

    const toolCalls: LlmToolCall[] = [];
    const text: string[] = [];
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, name: block.name, input: block.input });
      } else if (block.type === 'text') {
        text.push(block.text);
      }
    }

    return {
      stopReason:
        response.stop_reason === 'tool_use' || response.stop_reason === 'pause_turn'
          ? response.stop_reason
          : 'end_turn',
      text: text.join('\n'),
      toolCalls,
      // The full content (including thinking blocks) is kept verbatim for replay.
      assistantMessage: { role: 'assistant', providerContent: response.content },
      usage,
    };
  }

  private fallbackParams() {
    return this.options.serverSideFallback === false
      ? {}
      : { betas: [SERVER_SIDE_FALLBACK_BETA], fallbacks: 'default' as const };
  }
}

function assertCompleted(response: BetaMessage, usage: LlmUsage): void {
  if (response.stop_reason === 'refusal') {
    throw new LlmRefusalError(response.stop_details?.category ?? null, usage);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new LlmTruncatedError(usage);
  }
}

function toUsage(response: BetaMessage): LlmUsage {
  const tokens = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
  };
  // Priced by the model that served the request, which differs after a fallback.
  return { model: response.model, ...tokens, costUsd: estimateCostUsd(response.model, tokens) };
}

function toAnthropicMessages(messages: LlmMessage[]): BetaMessageParam[] {
  return messages.map((message): BetaMessageParam => {
    if (message.role === 'assistant') {
      return { role: 'assistant', content: message.providerContent as BetaContentBlockParam[] };
    }
    return {
      role: 'user',
      content: message.content.map((block): BetaContentBlockParam =>
        block.type === 'text'
          ? { type: 'text', text: block.text }
          : {
              type: 'tool_result',
              tool_use_id: block.toolCallId,
              content: block.content,
              ...(block.isError && { is_error: true }),
            },
      ),
    };
  });
}

function toAnthropicTool(tool: LlmToolDefinition): Anthropic.Beta.Messages.BetaTool {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(tool.input, { io: 'input' });
  return {
    name: tool.name,
    description: tool.description,
    strict: true,
    input_schema: { ...schema, type: 'object' },
  };
}
