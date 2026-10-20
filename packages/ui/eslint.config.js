import { forgeopsConfig } from '@forgeops/eslint-config';
import reactHooks from 'eslint-plugin-react-hooks';

export default forgeopsConfig({
  tsconfigRootDir: import.meta.dirname,
  boundary: 'ui',
  extend: [reactHooks.configs.flat['recommended-latest']],
});
