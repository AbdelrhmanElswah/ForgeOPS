import { AUTH_COOKIES } from '@forgeops/contracts';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { UnauthenticatedError } from '../../../common/errors/domain-error.js';
import { TokenService } from '../application/token.service.js';
import { type AuthenticatedRequest, IS_PUBLIC } from './auth.decorators.js';
import { readCookie } from './auth-cookies.js';

/**
 * Global guard. Accepts the access token from the httpOnly cookie (browser) or an
 * `Authorization: Bearer` header (scripts, Swagger). Verification is stateless: no database
 * hit per request. The trade-off: a revoked session's access token keeps working until it
 * expires (≤ 15 minutes), which is why access tokens are short-lived.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || context.getType() !== 'http') {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request) ?? readCookie(request, AUTH_COOKIES.accessToken);
    if (!token) {
      throw new UnauthenticatedError();
    }

    const claims = await this.tokens.verifyAccessToken(token);
    request.user = { id: claims.userId, sessionId: claims.sessionId };
    return true;
  }
}

function bearerToken(request: AuthenticatedRequest): string | undefined {
  const [scheme, value] = request.headers.authorization?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
}
