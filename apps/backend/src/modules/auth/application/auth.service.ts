import { randomUUID } from 'node:crypto';

import type { LoginRequest, RegisterRequest } from '@forgeops/contracts';
import { Injectable, Logger } from '@nestjs/common';

import { AppConfig } from '../../../common/config/app-config.service.js';
import { UnauthenticatedError } from '../../../common/errors/domain-error.js';
import { type UserRecord, UsersRepository } from '../../users/users.repository.js';
import { PasswordHasher } from './password-hasher.js';
import { type NewSession, SessionsRepository } from './sessions.repository.js';
import { TokenService } from './token.service.js';

/**
 * Two tabs that refresh at the same moment both send the same refresh token; one wins the
 * rotation. A second presentation within this window is treated as that race (plain 401,
 * the other tab already holds the new cookie), not as theft.
 */
export const REUSE_GRACE_MS = 10_000;

const INVALID_CREDENTIALS = 'Invalid email or password.';
const SESSION_EXPIRED = 'Your session has expired. Please sign in again.';

export interface ClientContext {
  userAgent: string | null;
  ipAddress: string | null;
}

export interface AuthResult {
  user: UserRecord;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly config: AppConfig,
  ) {}

  async register(input: RegisterRequest, client: ClientContext): Promise<AuthResult> {
    const user = await this.users.create({
      email: input.email,
      passwordHash: await this.hasher.hash(input.password),
      displayName: input.displayName ?? null,
    });
    return this.startSession(user, randomUUID(), client);
  }

  async login(input: LoginRequest, client: ClientContext): Promise<AuthResult> {
    const user = await this.users.findByEmail(input.email);

    // Always run one argon2 verification, even for unknown emails. Otherwise "no such user"
    // answers in ~1 ms and "wrong password" in ~50 ms, and response timing would reveal
    // which emails have accounts (user enumeration).
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const valid = await this.hasher.verify(hash, input.password);

    if (!user?.passwordHash || !valid) {
      throw new UnauthenticatedError(INVALID_CREDENTIALS);
    }
    return this.startSession(user, randomUUID(), client);
  }

  async refresh(refreshToken: string | undefined, client: ClientContext): Promise<AuthResult> {
    if (!refreshToken) {
      throw new UnauthenticatedError(SESSION_EXPIRED);
    }
    const now = new Date();
    const session = await this.sessions.findByTokenHash(this.tokens.hashRefreshToken(refreshToken));
    if (!session) {
      throw new UnauthenticatedError(SESSION_EXPIRED);
    }

    if (session.replacedById) {
      const rotatedAgoMs = now.getTime() - (session.revokedAt?.getTime() ?? 0);
      if (rotatedAgoMs > REUSE_GRACE_MS) {
        // A token that was already exchanged is being used again: either the user or an
        // attacker holds a stolen copy. We can't tell which, so end every session in the family.
        await this.sessions.revokeFamily(session.familyId, now);
        this.logger.warn(
          { userId: session.userId, familyId: session.familyId },
          'Refresh token reuse detected; session family revoked',
        );
      }
      throw new UnauthenticatedError(SESSION_EXPIRED);
    }

    if (session.revokedAt || session.expiresAt <= now) {
      throw new UnauthenticatedError(SESSION_EXPIRED);
    }

    const user = await this.users.findById(session.userId);
    if (!user) {
      throw new UnauthenticatedError(SESSION_EXPIRED);
    }

    const refreshTokenNext = this.tokens.generateRefreshToken();
    const next = await this.sessions.rotate(
      session.id,
      this.newSession(user.id, session.familyId, refreshTokenNext, client),
      now,
    );
    if (!next) {
      throw new UnauthenticatedError(SESSION_EXPIRED);
    }
    return {
      user,
      accessToken: await this.tokens.signAccessToken(user.id, next.id),
      refreshToken: refreshTokenNext,
      refreshExpiresAt: next.expiresAt,
    };
  }

  /** Idempotent: logging out with a missing or unknown token still succeeds. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const session = await this.sessions.findByTokenHash(this.tokens.hashRefreshToken(refreshToken));
    if (session && !session.revokedAt) {
      await this.sessions.revoke(session.id, new Date());
    }
  }

  private async startSession(
    user: UserRecord,
    familyId: string,
    client: ClientContext,
  ): Promise<AuthResult> {
    const refreshToken = this.tokens.generateRefreshToken();
    const session = await this.sessions.create(
      this.newSession(user.id, familyId, refreshToken, client),
    );
    return {
      user,
      accessToken: await this.tokens.signAccessToken(user.id, session.id),
      refreshToken,
      refreshExpiresAt: session.expiresAt,
    };
  }

  private newSession(
    userId: string,
    familyId: string,
    refreshToken: string,
    client: ClientContext,
  ): NewSession {
    const ttlMs = this.config.get('REFRESH_TOKEN_TTL_DAYS') * 24 * 60 * 60 * 1000;
    return {
      userId,
      familyId,
      refreshTokenHash: this.tokens.hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + ttlMs),
      userAgent: client.userAgent,
      ipAddress: client.ipAddress,
    };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash('forgeops-timing-equaliser');
    return this.dummyHash;
  }
}
