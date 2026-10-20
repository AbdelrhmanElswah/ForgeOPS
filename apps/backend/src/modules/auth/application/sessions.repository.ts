export interface SessionRecord {
  id: string;
  userId: string;
  familyId: string;
  refreshTokenHash: string;
  /** Set once this token has been rotated: presenting it again means reuse. */
  replacedById: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface NewSession {
  userId: string;
  familyId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}

/** Port for refresh-token sessions. */
export abstract class SessionsRepository {
  abstract create(session: NewSession): Promise<SessionRecord>;
  abstract findByTokenHash(refreshTokenHash: string): Promise<SessionRecord | null>;

  /**
   * Atomically retires `currentId` and creates its successor. Returns null when `currentId`
   * was already retired: another request rotated it first, and only one may win.
   */
  abstract rotate(currentId: string, next: NewSession, now: Date): Promise<SessionRecord | null>;

  abstract revoke(id: string, now: Date): Promise<void>;
  abstract revokeFamily(familyId: string, now: Date): Promise<void>;
}
