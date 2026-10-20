import { Injectable } from '@nestjs/common';

import { isUniqueViolation } from '../../../infrastructure/prisma/prisma-errors.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import {
  EmailAlreadyRegisteredError,
  type NewUser,
  type UserRecord,
  UsersRepository,
} from '../users.repository.js';

const USER_FIELDS = {
  id: true,
  email: true,
  passwordHash: true,
  displayName: true,
  createdAt: true,
} as const;

@Injectable()
export class PrismaUsersRepository extends UsersRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  findById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { id }, select: USER_FIELDS });
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { email }, select: USER_FIELDS });
  }

  async create(user: NewUser): Promise<UserRecord> {
    try {
      return await this.prisma.user.create({ data: user, select: USER_FIELDS });
    } catch (error) {
      // Rely on the unique index, not a "check then insert": two concurrent sign-ups with the
      // same email would both pass a check, but only one can pass the constraint.
      if (isUniqueViolation(error)) {
        throw new EmailAlreadyRegisteredError();
      }
      throw error;
    }
  }
}
