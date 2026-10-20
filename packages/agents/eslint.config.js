import { boundaries, forgeopsConfig } from '@forgeops/eslint-config';

export default forgeopsConfig({
  tsconfigRootDir: import.meta.dirname,
  boundary: 'agents',
  extend: [
    {
      // The only place allowed to import a model provider's SDK.
      files: ['src/llm/*/**'],
      rules: { 'no-restricted-imports': ['error', { patterns: boundaries.agentsLlmAdapter }] },
    },
  ],
});
