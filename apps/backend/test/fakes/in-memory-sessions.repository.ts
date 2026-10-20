import { randomUUID } from 'node:crypto';

import {
  type NewSession,
  type SessionRecord,
  SessionsRepository,
} from '../../src/modules/auth/application/sessions.repository.js';

/** In-memory adapter for the SessionsRepository port, mirroring the Prisma semantics. */
export class InMemorySessionsRepository extends SessionsRepository {
  readonly rows = new Map<string, SessionRecord>();

  create(session: NewSession): Promise<SessionRecord> {
    const record: SessionRecord = {
      id: randomUUID(),
      userId: session.userId,
      familyId: session.familyId,
      refreshTokenHash: session.refreshTokenHash,
      expiresAt: session.expiresAt,
      replacedById: null,
      revokedAt: null,
    };
    this.rows.set(record.id, record);
    return Promise.resolve(record);
  }

  findByTokenHash(hash: string): Promise<SessionRecord | null> {
    return Promise.resolve(
      [...this.rows.values()].find((s) => s.refreshTokenHash === hash) ?? null,
    );
  }

  async rotate(currentId: string, next: NewSession, now: Date): Promise<SessionRecord | null> {
    const current = this.rows.get(currentId);
    if (!current || current.replacedById || current.revokedAt) {
      return null;
    }
    const created = await this.create(next);
    current.revokedAt = now;
    current.replacedById = created.id;
    return created;
  }

  revoke(id: string, now: Date): Promise<void> {
    const session = this.rows.get(id);
    if (session && !session.revokedAt) session.revokedAt = now;
    return Promise.resolve();
  }

  revokeFamily(familyId: string, now: Date): Promise<void> {
    for (const session of this.rows.values()) {
      if (session.familyId === familyId && !session.revokedAt) session.revokedAt = now;
    }
    return Promise.resolve();
  }
}
