import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { z } from 'zod';

import { UnauthenticatedError } from '../../../common/errors/domain-error.js';

export const JWT_ISSUER = 'forgeops';
export const JWT_AUDIENCE = 'forgeops-api';

const AccessTokenClaimsSchema = z.object({
  sub: z.uuid(),
  sid: z.uuid(),
});

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
}

/**
 * Two kinds of token with deliberately different designs:
 * - Access token: a short-lived signed JWT, verified without a database lookup (fast, stateless).
 * - Refresh token: an opaque random string whose SHA-256 is stored in `sessions`. Being
 *   server-side state, it can be rotated and revoked.
 */
@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  signAccessToken(userId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync({ sid: sessionId }, { subject: userId });
  }

  /** @throws UnauthenticatedError for any invalid, expired or malformed token */
  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    let payload: unknown;
    try {
      // Algorithm, issuer and audience are pinned in JwtModule's verifyOptions (auth.module.ts).
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthenticatedError('The access token is invalid or has expired.');
    }
    const claims = AccessTokenClaimsSchema.safeParse(payload);
    if (!claims.success) {
      throw new UnauthenticatedError('The access token is invalid or has expired.');
    }
    return { userId: claims.data.sub, sessionId: claims.data.sid };
  }

  /** 256 bits of randomness: unguessable, so a fast hash (SHA-256) is enough to store it. */
  generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
