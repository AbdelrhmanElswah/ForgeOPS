/**
 * USD per million tokens, Claude API first-party rates (source: Anthropic pricing table as of
 * 2026-10-06). Prices change: update this table when they do. A model missing here costs
 * `null`, which the budget layer treats as "unknown", never as free.
 *
 * Cache writes (5-minute TTL) are billed at 1.25× the input rate.
 */
interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
}

const PRICES: Record<string, ModelPrice> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  // Haiku 5.5: rate for prompts up to 100K tokens (higher above that).
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

const CACHE_WRITE_MULTIPLIER = 1.25;
const PER_TOKEN = 1 / 1_000_000;

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export function estimateCostUsd(model: string, tokens: TokenCounts): number | null {
  const price = PRICES[model];
  if (!price) {
    return null;
  }
  const cost =
    tokens.inputTokens * price.input +
    tokens.outputTokens * price.output +
    tokens.cacheReadInputTokens * price.cacheRead +
    tokens.cacheCreationInputTokens * price.input * CACHE_WRITE_MULTIPLIER;
  return cost * PER_TOKEN;
}
