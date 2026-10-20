import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { PlanSchema } from '../../outputs/plan.js';
import {
  LlmInvalidOutputError,
  type LlmMessage,
  LlmRefusalError,
  LlmTruncatedError,
} from '../../ports/llm.port.js';
import { ClaudeLlmClient, DEFAULT_ROLE_MODELS } from './claude-llm.client.js';

interface CapturedRequest {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

/**
 * A real Anthropic SDK client whose `fetch` is replaced: requests are captured and canned
 * responses returned, so the tests cover the SDK's own serialisation and parsing.
 */
function fakeApi(...responses: Record<string, unknown>[]) {
  const requests: CapturedRequest[] = [];
  const fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const body = typeof init?.body === 'string' ? init.body : '{}';
    requests.push({
      url: input instanceof Request ? input.url : input.toString(),
      headers: new Headers(init?.headers),
      body: JSON.parse(body) as Record<string, unknown>,
    });
    const next = responses.shift();
    if (!next) throw new Error('fake API: no response left');
    return Promise.resolve(
      new Response(JSON.stringify(next), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  const client = new Anthropic({ apiKey: 'test-key', fetch, maxRetries: 0 });
  return { client, requests };
}

function message(overrides: Record<string, unknown>) {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    stop_reason: 'end_turn',
    stop_sequence: null,
    content: [],
    usage: {
      input_tokens: 1_000,
      output_tokens: 500,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    ...overrides,
  };
}

const plan = {
  goal: 'Fix the checkout 500',
  steps: [{ title: 'Read handler', detail: 'Inspect checkout.controller.ts' }],
  suspectedAreas: [{ path: 'src/checkout', reason: 'Stack trace points here' }],
  acceptanceCriteria: ['Regression test passes'],
};

const userMessage: LlmMessage = { role: 'user', content: [{ type: 'text', text: 'Fix the bug' }] };

describe('ClaudeLlmClient', () => {
  describe('generateStructured', () => {
    it('sends the role model, effort, schema and fallback opt-in; returns the parsed output', async () => {
      const api = fakeApi(message({ content: [{ type: 'text', text: JSON.stringify(plan) }] }));
      const llm = new ClaudeLlmClient({
        client: api.client,
        models: { ...DEFAULT_ROLE_MODELS, planner: { model: 'claude-opus-5-5', effort: 'medium' } },
      });

      const { output, usage } = await llm.generateStructured({
        role: 'planner',
        system: 'You plan engineering tasks.',
        messages: [userMessage],
        schema: PlanSchema,
      });

      expect(output).toEqual(plan);
      const [request] = api.requests;
      expect(request?.body).toMatchObject({
        model: 'claude-opus-5-5',
        output_config: { effort: 'medium', format: { type: 'json_schema' } },
        fallbacks: 'default',
      });
      expect(request?.body).not.toHaveProperty('thinking'); // adaptive default, tuned by effort
      expect(request?.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
      // 1000 × $4/M + 500 × $20/M = $0.014
      expect(usage.costUsd).toBeCloseTo(0.014, 6);
    });

    it('turns a refusal into a typed error carrying the category', async () => {
      const api = fakeApi(
        message({
          stop_reason: 'refusal',
          stop_details: { type: 'refusal', category: 'cyber', explanation: 'declined' },
        }),
      );
      const llm = new ClaudeLlmClient({ client: api.client, models: DEFAULT_ROLE_MODELS });

      const error = await llm
        .generateStructured({
          role: 'planner',
          system: '',
          messages: [userMessage],
          schema: PlanSchema,
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(LlmRefusalError);
      expect((error as LlmRefusalError).category).toBe('cyber');
    });

    it('never uses a truncated answer', async () => {
      const api = fakeApi(
        message({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"goal":' }] }),
      );
      const llm = new ClaudeLlmClient({ client: api.client, models: DEFAULT_ROLE_MODELS });

      await expect(
        llm.generateStructured({
          role: 'planner',
          system: '',
          messages: [userMessage],
          schema: PlanSchema,
        }),
      ).rejects.toBeInstanceOf(LlmTruncatedError);
    });

    it('rejects output that does not match the schema', async () => {
      const api = fakeApi(message({ content: [{ type: 'text', text: '{"goal": 42}' }] }));
      const llm = new ClaudeLlmClient({ client: api.client, models: DEFAULT_ROLE_MODELS });

      await expect(
        llm.generateStructured({
          role: 'planner',
          system: '',
          messages: [userMessage],
          schema: PlanSchema,
        }),
      ).rejects.toBeInstanceOf(LlmInvalidOutputError);
    });

    it('can disable server-side fallback', async () => {
      const api = fakeApi(message({ content: [{ type: 'text', text: JSON.stringify(plan) }] }));
      const llm = new ClaudeLlmClient({
        client: api.client,
        models: DEFAULT_ROLE_MODELS,
        serverSideFallback: false,
      });

      await llm.generateStructured({
        role: 'planner',
        system: '',
        messages: [userMessage],
        schema: PlanSchema,
      });

      expect(api.requests[0]?.body).not.toHaveProperty('fallbacks');
    });
  });

  describe('respond (tool turns)', () => {
    const readFile = {
      name: 'read_file',
      description: 'Read a file from the workspace',
      input: z.strictObject({ path: z.string() }),
    };

    it('declares tools as strict JSON schemas and maps tool calls', async () => {
      const api = fakeApi(
        message({
          stop_reason: 'tool_use',
          content: [
            { type: 'text', text: 'Reading the handler.' },
            { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: 'src/a.ts' } },
          ],
        }),
      );
      const llm = new ClaudeLlmClient({ client: api.client, models: DEFAULT_ROLE_MODELS });

      const turn = await llm.respond({
        role: 'investigator',
        system: 'Investigate.',
        messages: [userMessage],
        tools: [readFile],
      });

      expect(turn.stopReason).toBe('tool_use');
      expect(turn.toolCalls).toEqual([
        { id: 'toolu_1', name: 'read_file', input: { path: 'src/a.ts' } },
      ]);
      expect(api.requests[0]?.body.tools).toEqual([
        {
          name: 'read_file',
          description: 'Read a file from the workspace',
          strict: true,
          input_schema: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
            additionalProperties: false,
          },
        },
      ]);
      expect(api.requests[0]?.body).not.toHaveProperty('tool_choice'); // forced choice is a 400
    });

    it('replays the assistant content verbatim, including thinking blocks', async () => {
      const assistantContent = [
        { type: 'thinking', thinking: '', signature: 'sig-abc' },
        { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: 'src/a.ts' } },
      ];
      const api = fakeApi(
        message({ stop_reason: 'tool_use', content: assistantContent }),
        message({ content: [{ type: 'text', text: 'Done.' }] }),
      );
      const llm = new ClaudeLlmClient({ client: api.client, models: DEFAULT_ROLE_MODELS });

      const first = await llm.respond({
        role: 'investigator',
        system: '',
        messages: [userMessage],
        tools: [readFile],
      });
      await llm.respond({
        role: 'investigator',
        system: '',
        messages: [
          userMessage,
          first.assistantMessage,
          {
            role: 'user',
            content: [{ type: 'tool_result', toolCallId: 'toolu_1', content: 'file text' }],
          },
        ],
        tools: [readFile],
      });

      expect(api.requests[1]?.body.messages).toEqual([
        { role: 'user', content: [{ type: 'text', text: 'Fix the bug' }] },
        { role: 'assistant', content: assistantContent },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'file text' }],
        },
      ]);
    });

    it('prices by the model that actually served the request (after a fallback)', async () => {
      const api = fakeApi(
        message({ model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'ok' }] }),
      );
      const llm = new ClaudeLlmClient({ client: api.client, models: DEFAULT_ROLE_MODELS });

      const turn = await llm.respond({
        role: 'investigator',
        system: '',
        messages: [userMessage],
        tools: [],
      });

      expect(turn.usage.model).toBe('claude-sonnet-5-5');
      // 1000 × $2/M + 500 × $10/M = $0.007
      expect(turn.usage.costUsd).toBeCloseTo(0.007, 6);
    });
  });
});
