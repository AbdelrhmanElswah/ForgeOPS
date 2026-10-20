import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import {
  type NewSession,
  type SessionRecord,
  SessionsRepository,
} from '../application/sessions.repository.js';

const SESSION_FIELDS = {
  id: true,
  userId: true,
  familyId: true,
  refreshTokenHash: true,
  replacedById: true,
  expiresAt: true,
  revokedAt: true,
} as const;

@Injectable()
export class PrismaSessionsRepository extends SessionsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  create(session: NewSession): Promise<SessionRecord> {
    return this.prisma.session.create({ data: session, select: SESSION_FIELDS });
  }

  findByTokenHash(refreshTokenHash: string): Promise<SessionRecord | null> {
    return this.prisma.session.findUnique({ where: { refreshTokenHash }, select: SESSION_FIELDS });
  }

  rotate(currentId: string, next: NewSession, now: Date): Promise<SessionRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      // Compare-and-set: only succeeds if nobody rotated or revoked this session yet.
      // Two concurrent refreshes both reach this line, but only one sees count === 1.
      const { count } = await tx.session.updateMany({
        where: { id: currentId, replacedById: null, revokedAt: null },
        data: { revokedAt: now },
      });
      if (count === 0) {
        return null;
      }
      const created = await tx.session.create({ data: next, select: SESSION_FIELDS });
      await tx.session.update({ where: { id: currentId }, data: { replacedById: created.id } });
      return created;
    });
  }

  async revoke(id: string, now: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
