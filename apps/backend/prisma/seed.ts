/**
 * Development seed data. Idempotent (upserts), so `pnpm db:seed` is safe to run repeatedly.
 * The demo user gets a password in step 1.7, when argon2 hashing lands with the auth module.
 */
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client.js';

const DEMO_EMAIL = 'demo@forgeops.dev';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const user = await prisma.user.upsert({
      where: { email: DEMO_EMAIL },
      update: {},
      create: { email: DEMO_EMAIL, displayName: 'Demo User' },
    });
    console.info(`Seeded user ${user.email} (${user.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
