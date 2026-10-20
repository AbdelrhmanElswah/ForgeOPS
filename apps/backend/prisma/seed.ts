/**
 * Development seed data. Idempotent (upserts), so `pnpm db:seed` is safe to run repeatedly.
 * Sign in locally with demo@forgeops.dev / forgeops-demo-password.
 */
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { Argon2PasswordHasher } from '../src/modules/auth/infrastructure/argon2-password-hasher.js';

const DEMO_EMAIL = 'demo@forgeops.dev';
const DEMO_PASSWORD = 'forgeops-demo-password';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const passwordHash = await new Argon2PasswordHasher().hash(DEMO_PASSWORD);
    const user = await prisma.user.upsert({
      where: { email: DEMO_EMAIL },
      update: { passwordHash },
      create: { email: DEMO_EMAIL, displayName: 'Demo User', passwordHash },
    });
    console.info(`Seeded user ${user.email} (${user.id}), password: ${DEMO_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
