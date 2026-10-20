import { Injectable } from '@nestjs/common';

import { isUniqueViolation } from '../../../infrastructure/prisma/prisma-errors.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import {
  EmailAlreadyRegisteredError,
  GitHubAccountAlreadyLinkedError,
  type NewUser,
  type UserRecord,
  UsersRepository,
} from '../users.repository.js';

const USER_FIELDS = {
  id: true,
  email: true,
  passwordHash: true,
  displayName: true,
  githubUserId: true,
  createdAt: true,
} as const;

type UserRow = Omit<UserRecord, 'githubUserId'> & { githubUserId: bigint | null };

function toRecord(row: UserRow): UserRecord {
  return { ...row, githubUserId: row.githubUserId === null ? null : Number(row.githubUserId) };
}

@Injectable()
export class PrismaUsersRepository extends UsersRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { id }, select: USER_FIELDS });
    return row && toRecord(row);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { email }, select: USER_FIELDS });
    return row && toRecord(row);
  }

  async create(user: NewUser): Promise<UserRecord> {
    try {
      return toRecord(await this.prisma.user.create({ data: user, select: USER_FIELDS }));
    } catch (error) {
      // Rely on the unique index, not a "check then insert": two concurrent sign-ups with the
      // same email would both pass a check, but only one can pass the constraint.
      if (isUniqueViolation(error)) {
        throw new EmailAlreadyRegisteredError();
      }
      throw error;
    }
  }

  async linkGitHubAccount(userId: string, githubUserId: number): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { githubUserId: BigInt(githubUserId) },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new GitHubAccountAlreadyLinkedError();
      }
      throw error;
    }
  }
}
