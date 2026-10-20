import { forgeopsConfig } from '@forgeops/eslint-config';
import nextVitals from 'eslint-config-next/core-web-vitals';

// Next's React, hooks, jsx-a11y and Next.js rules. Its TypeScript block is skipped: our shared
// config already applies stricter, type-aware TypeScript rules.
const nextRules = nextVitals.filter((config) => config.name !== 'next/typescript');

export default forgeopsConfig({
  tsconfigRootDir: import.meta.dirname,
  boundary: 'web',
  extend: [...nextRules, { ignores: ['next-env.d.ts', '.next/**'] }],
});
