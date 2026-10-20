import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // esbuild (Vitest's default transformer) cannot emit decorator metadata, which Nest's
  // dependency injection relies on. SWC can, so tests compile the same way `tsc` does.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgresql://forgeops:forgeops@localhost:5433/forgeops_test',
      REDIS_URL: 'redis://localhost:6379/1',
    },
  },
});
