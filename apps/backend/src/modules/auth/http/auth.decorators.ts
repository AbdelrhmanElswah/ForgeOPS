import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  sessionId: string;
}

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

export const IS_PUBLIC = 'forgeops:isPublic';
export const SKIP_CSRF = 'forgeops:skipCsrf';

/**
 * Every route requires authentication unless it opts out. Secure by default: forgetting a
 * decorator yields a 401, never an accidentally public endpoint.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/** For machine callers that authenticate differently (e.g. HMAC-signed GitHub webhooks). */
export const SkipCsrf = (): MethodDecorator & ClassDecorator => SetMetadata(SKIP_CSRF, true);

/** Injects the authenticated user that JwtAuthGuard attached to the request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) {
      // Only reachable through a programming error: @CurrentUser() on a @Public() route.
      throw new Error('@CurrentUser() used on a route without authentication');
    }
    return user;
  },
);
