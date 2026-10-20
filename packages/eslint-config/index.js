import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { boundaries } from './boundaries.js';

/**
 * Builds the ESLint flat config for one workspace.
 *
 * @param {object} options
 * @param {string} options.tsconfigRootDir  Pass `import.meta.dirname` so typed rules find the right tsconfig.
 * @param {keyof typeof boundaries} [options.boundary]  Which architecture boundary this workspace obeys.
 * @param {import('eslint').Linter.Config[]} [options.extend]  Workspace-specific overrides (Nest, Next, …).
 */
export function forgeopsConfig({ tsconfigRootDir, boundary, extend = [] }) {
  return defineConfig(
    globalIgnores([
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/node_modules/**',
    ]),

    js.configs.recommended,

    {
      files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
      extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      },
    },

    {
      files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
      languageOptions: { globals: globals.node },
    },

    {
      rules: {
        eqeqeq: ['error', 'always'],
        'no-console': 'warn',
        ...(boundary && { 'no-restricted-imports': ['error', { patterns: boundaries[boundary] }] }),
      },
    },

    ...extend,

    // Must stay last: turns off stylistic rules that would fight Prettier.
    prettier,
  );
}

export { boundaries };
