import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The design system ships TypeScript source; Next compiles it like app code.
  transpilePackages: ['@forgeops/ui'],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
};

export default nextConfig;
