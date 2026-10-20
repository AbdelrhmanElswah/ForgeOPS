import { describe, expect, it } from 'vitest';

import { estimateCostUsd } from './pricing.js';

const tokens = (overrides: Partial<Parameters<typeof estimateCostUsd>[1]> = {}) => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  ...overrides,
});

describe('estimateCostUsd', () => {
  it('prices input, output, cache reads and cache writes separately', () => {
    // Opus 5.5: $4 in, $20 out, $0.20 cache read, cache write = 1.25 × $4 = $5 (per million)
    expect(
      estimateCostUsd(
        'claude-opus-5-5',
        tokens({
          inputTokens: 1_000_000,
          outputTokens: 1_000_000,
          cacheReadInputTokens: 1_000_000,
          cacheCreationInputTokens: 1_000_000,
        }),
      ),
    ).toBeCloseTo(4 + 20 + 0.2 + 5, 6);
  });

  it('returns null for an unknown model instead of pretending it is free', () => {
    expect(estimateCostUsd('some-new-model', tokens({ inputTokens: 1 }))).toBeNull();
  });
});
