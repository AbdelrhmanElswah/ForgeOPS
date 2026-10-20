import { AUTH_COOKIES } from '@forgeops/contracts';
import { Injectable } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';

import { AppConfig } from '../../../common/config/app-config.service.js';
import type { AuthResult } from '../application/auth.service.js';

/** The refresh cookie is only ever sent to the auth endpoints, never to the rest of the API. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export function readCookie(request: Request, name: string): string | undefined {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

@Injectable()
export class AuthCookies {
  constructor(private readonly config: AppConfig) {}

  set(response: Response, result: AuthResult): void {
    response.cookie(AUTH_COOKIES.accessToken, result.accessToken, {
      ...this.baseOptions(),
      path: '/',
      maxAge: this.config.get('ACCESS_TOKEN_TTL_SECONDS') * 1000,
    });
    response.cookie(AUTH_COOKIES.refreshToken, result.refreshToken, {
      ...this.baseOptions(),
      path: REFRESH_COOKIE_PATH,
      expires: result.refreshExpiresAt,
    });
  }

  clear(response: Response): void {
    response.clearCookie(AUTH_COOKIES.accessToken, { ...this.baseOptions(), path: '/' });
    response.clearCookie(AUTH_COOKIES.refreshToken, {
      ...this.baseOptions(),
      path: REFRESH_COOKIE_PATH,
    });
  }

  private baseOptions(): CookieOptions {
    return {
      // JavaScript can't read the cookies, so an XSS bug can't exfiltrate the tokens.
      httpOnly: true,
      // HTTPS-only in production. Browsers allow non-secure cookies on http://localhost.
      secure: this.config.isProduction,
      sameSite: 'lax',
    };
  }
}
