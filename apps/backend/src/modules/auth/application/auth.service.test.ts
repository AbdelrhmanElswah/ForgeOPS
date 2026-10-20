import { JwtService } from '@nestjs/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemorySessionsRepository } from '../../../../test/fakes/in-memory-sessions.repository.js';
import { InMemoryUsersRepository } from '../../../../test/fakes/in-memory-users.repository.js';
import type { AppConfig } from '../../../common/config/app-config.service.js';
import { UnauthenticatedError } from '../../../common/errors/domain-error.js';
import { EmailAlreadyRegisteredError } from '../../users/users.repository.js';
import { AuthService, type ClientContext, REUSE_GRACE_MS } from './auth.service.js';
import { PasswordHasher } from './password-hasher.js';
import { JWT_AUDIENCE, JWT_ISSUER, TokenService } from './token.service.js';

/** Instant, transparent hasher so these tests focus on auth rules, not on argon2. */
class FakeHasher extends PasswordHasher {
  hash(password: string): Promise<string> {
    return Promise.resolve(`hashed:${password}`);
  }
  verify(hash: string, password: string): Promise<boolean> {
    return Promise.resolve(hash === `hashed:${password}`);
  }
}

const SECRET = 'unit-test-secret-that-is-at-least-32-chars';
const client: ClientContext = { userAgent: 'vitest', ipAddress: '127.0.0.1' };
const credentials = { email: 'dev@example.com', password: 'correct horse battery' };

function buildService() {
  const users = new InMemoryUsersRepository();
  const sessions = new InMemorySessionsRepository();
  const hasher = new FakeHasher();
  const jwt = new JwtService({
    secret: SECRET,
    signOptions: { algorithm: 'HS256', expiresIn: 900, issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
    verifyOptions: { algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
  });
  const tokens = new TokenService(jwt);
  const config = { get: () => 30 } as unknown as AppConfig; // REFRESH_TOKEN_TTL_DAYS
  const auth = new AuthService(users, sessions, hasher, tokens, config);
  return { auth, users, sessions, hasher, tokens };
}

describe('AuthService', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T10:00:00Z'));
    ctx = buildService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('register / login', () => {
    it('registers a user and issues a verifiable access token', async () => {
      const result = await ctx.auth.register(credentials, client);

      const claims = await ctx.tokens.verifyAccessToken(result.accessToken);
      expect(claims.userId).toBe(result.user.id);
      expect(result.user.passwordHash).not.toBe(credentials.password);
    });

    it('rejects a second account with the same email', async () => {
      await ctx.auth.register(credentials, client);

      await expect(ctx.auth.register(credentials, client)).rejects.toBeInstanceOf(
        EmailAlreadyRegisteredError,
      );
    });

    it('gives the same answer for a wrong password and an unknown email', async () => {
      await ctx.auth.register(credentials, client);

      const wrongPassword = ctx.auth.login({ ...credentials, password: 'nope' }, client);
      const unknownEmail = ctx.auth.login({ ...credentials, email: 'ghost@example.com' }, client);

      await expect(wrongPassword).rejects.toThrow('Invalid email or password.');
      await expect(unknownEmail).rejects.toThrow('Invalid email or password.');
    });

    it('still runs a password verification for unknown emails (timing equalisation)', async () => {
      const verify = vi.spyOn(ctx.hasher, 'verify');

      await expect(
        ctx.auth.login({ email: 'ghost@example.com', password: 'x' }, client),
      ).rejects.toBeInstanceOf(UnauthenticatedError);
      expect(verify).toHaveBeenCalledTimes(1);
    });
  });

  describe('refresh rotation', () => {
    it('exchanges a refresh token for a new pair and retires the old one', async () => {
      const first = await ctx.auth.register(credentials, client);

      const second = await ctx.auth.refresh(first.refreshToken, client);

      expect(second.refreshToken).not.toBe(first.refreshToken);
      const old = await ctx.sessions.findByTokenHash(
        ctx.tokens.hashRefreshToken(first.refreshToken),
      );
      expect(old?.replacedById).not.toBeNull();
    });

    it('treats reuse of a rotated token as theft and revokes the whole family', async () => {
      const first = await ctx.auth.register(credentials, client);
      const second = await ctx.auth.refresh(first.refreshToken, client);

      vi.setSystemTime(Date.now() + REUSE_GRACE_MS + 1);
      await expect(ctx.auth.refresh(first.refreshToken, client)).rejects.toBeInstanceOf(
        UnauthenticatedError,
      );

      // The attacker may hold `second`; it must be dead too.
      await expect(ctx.auth.refresh(second.refreshToken, client)).rejects.toBeInstanceOf(
        UnauthenticatedError,
      );
    });

    it('treats reuse within the grace window as a benign race (family survives)', async () => {
      const first = await ctx.auth.register(credentials, client);
      const second = await ctx.auth.refresh(first.refreshToken, client);

      await expect(ctx.auth.refresh(first.refreshToken, client)).rejects.toBeInstanceOf(
        UnauthenticatedError,
      );
      await expect(ctx.auth.refresh(second.refreshToken, client)).resolves.toBeDefined();
    });

    it('does not revoke other logins of the same user on reuse', async () => {
      const laptop = await ctx.auth.register(credentials, client);
      const phone = await ctx.auth.login(credentials, client);
      await ctx.auth.refresh(laptop.refreshToken, client);

      vi.setSystemTime(Date.now() + REUSE_GRACE_MS + 1);
      await expect(ctx.auth.refresh(laptop.refreshToken, client)).rejects.toThrow();

      await expect(ctx.auth.refresh(phone.refreshToken, client)).resolves.toBeDefined();
    });

    it('rejects an expired refresh token', async () => {
      const first = await ctx.auth.register(credentials, client);

      vi.setSystemTime(Date.now() + 31 * 24 * 60 * 60 * 1000);

      await expect(ctx.auth.refresh(first.refreshToken, client)).rejects.toBeInstanceOf(
        UnauthenticatedError,
      );
    });

    it('rejects a missing or unknown refresh token', async () => {
      await expect(ctx.auth.refresh(undefined, client)).rejects.toBeInstanceOf(
        UnauthenticatedError,
      );
      await expect(ctx.auth.refresh('made-up-token', client)).rejects.toBeInstanceOf(
        UnauthenticatedError,
      );
    });
  });

  describe('logout', () => {
    it('revokes the session so its refresh token stops working', async () => {
      const first = await ctx.auth.register(credentials, client);

      await ctx.auth.logout(first.refreshToken);

      await expect(ctx.auth.refresh(first.refreshToken, client)).rejects.toBeInstanceOf(
        UnauthenticatedError,
      );
    });

    it('is idempotent', async () => {
      await expect(ctx.auth.logout(undefined)).resolves.toBeUndefined();
      await expect(ctx.auth.logout('unknown')).resolves.toBeUndefined();
    });
  });

  describe('access tokens', () => {
    it('rejects a token signed with another secret', async () => {
      const forged = await new JwtService({ secret: 'x'.repeat(40) }).signAsync(
        { sid: crypto.randomUUID() },
        { subject: crypto.randomUUID(), issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
      );

      await expect(ctx.tokens.verifyAccessToken(forged)).rejects.toBeInstanceOf(
        UnauthenticatedError,
      );
    });

    it('rejects an unsigned "alg: none" token', async () => {
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
        sub: crypto.randomUUID(),
        sid: crypto.randomUUID(),
        iss: JWT_ISSUER,
        aud: JWT_AUDIENCE,
      })}.`;

      await expect(ctx.tokens.verifyAccessToken(unsigned)).rejects.toBeInstanceOf(
        UnauthenticatedError,
      );
    });

    it('rejects an expired token', async () => {
      const { accessToken } = await ctx.auth.register(credentials, client);

      vi.setSystemTime(Date.now() + 901 * 1000);

      await expect(ctx.tokens.verifyAccessToken(accessToken)).rejects.toBeInstanceOf(
        UnauthenticatedError,
      );
    });
  });
});
