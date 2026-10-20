import { Prisma } from '../../generated/prisma/client.js';

/** True when a write failed because it would violate a unique constraint (Prisma code P2002). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
