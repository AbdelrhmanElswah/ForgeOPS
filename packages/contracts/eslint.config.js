import { forgeopsConfig } from '@forgeops/eslint-config';

export default forgeopsConfig({ tsconfigRootDir: import.meta.dirname, boundary: 'contracts' });
