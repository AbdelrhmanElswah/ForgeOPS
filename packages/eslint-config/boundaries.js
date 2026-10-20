// Architecture boundaries (see docs/ARCHITECTURE.md §3 "Dependency rule").
// Each workspace declares which imports it is NOT allowed to make, so a wrong
// dependency direction fails `pnpm lint` instead of silently eroding the design.

const infrastructure = [
  '@nestjs/*',
  '@prisma/*',
  '@octokit/*',
  'octokit',
  'dockerode',
  'bullmq',
  'ioredis',
];

/** @type {Record<string, { group: string[], message: string }[]>} */
export const boundaries = {
  // Pure schemas: shared by everyone, so it must depend on nothing but zod.
  contracts: [
    {
      group: [
        '@forgeops/*',
        ...infrastructure,
        'next',
        'next/*',
        'react',
        'react/*',
        '@langchain/*',
      ],
      message: 'packages/contracts may only depend on zod.',
    },
  ],

  // The agent brain stays framework-agnostic; infrastructure comes in through ports.
  agents: [
    {
      group: [...infrastructure, '@forgeops/backend', '@forgeops/web', 'next', 'next/*', 'react'],
      message:
        'packages/agents must not import infrastructure. Define a port in src/ports instead.',
    },
  ],

  // The frontend talks to the backend over HTTP only, using shared contracts.
  web: [
    {
      group: [
        '@forgeops/backend',
        '@forgeops/agents',
        '@nestjs/*',
        '@prisma/*',
        'bullmq',
        'dockerode',
      ],
      message: 'apps/web may only share code with the backend through @forgeops/contracts.',
    },
  ],

  backend: [
    {
      group: ['@forgeops/web', 'next', 'next/*', 'react', 'react/*'],
      message: 'apps/backend must not import frontend code.',
    },
  ],
};
