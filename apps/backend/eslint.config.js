import { forgeopsConfig } from '@forgeops/eslint-config';

export default forgeopsConfig({
  tsconfigRootDir: import.meta.dirname,
  boundary: 'backend',
  extend: [
    {
      files: ['**/*.ts'],
      rules: {
        // Nest modules are intentionally empty classes carrying a @Module() decorator.
        '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      },
    },
  ],
});
